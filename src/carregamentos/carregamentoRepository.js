// src/carregamentos/carregamentoRepository.js
export class CarregamentoRepository {
  constructor(db) {
    this.db = db;
  }

  async getNextNumeroCarregamento() {
    try {
      const [rows] = await this.db.execute(
        "SELECT COALESCE(MAX(car_numero), 0) + 1 as proximo FROM carregamentos"
      );
      return rows[0].proximo;
    } catch (error) {
      console.error("Error getting next numero:", error);
      throw error;
    }
  }

  async createHeader(data, userId) {
    try {
      const [result] = await this.db.execute(
        `INSERT INTO carregamentos 
         (car_numero, car_data, car_cliente_organizador, car_usuario_criacao, car_status) 
         VALUES (?, ?, ?, ?, 'EM ANDAMENTO')`,
        [data.numero, data.data, data.clienteOrganizadorId, userId]
      );
      return result.insertId;
    } catch (error) {
      console.error("Error creating header:", error);
      throw error;
    }
  }

  async createFilaWithLeituras(carregamentoId, clienteId, leituras) {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Criar fila
      const [filaResult] = await connection.execute(
        "INSERT INTO carregamento_filas (caf_carregamento, caf_cliente) VALUES (?, ?)",
        [carregamentoId, clienteId]
      );

      const filaId = filaResult.insertId;

      // Inserir leituras
      if (leituras.length > 0) {
        const values = leituras.map(() => "(?, ?, ?)").join(", ");
        const params = [];

        leituras.forEach((leitura) => {
          params.push(filaId, leitura.codigo, leitura.timestamp || new Date());
        });

        await connection.execute(
          `INSERT INTO carregamento_leituras (cal_fila, cal_codigo_lido, cal_timestamp) VALUES ${values}`,
          params
        );
      }

      await connection.commit();
      return filaId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateFilaPhotoPath(filaId, photoPath) {
    try {
      await this.db.execute(
        "UPDATE carregamento_filas SET caf_foto = ? WHERE caf_codigo = ?",
        [photoPath, filaId]
      );
    } catch (error) {
      console.error("Error updating photo path:", error);
      throw error;
    }
  }

  async finalize(carregamentoId) {
    try {
      const [result] = await this.db.execute(
        "UPDATE carregamentos SET car_status = ?, car_data_finalizacao = NOW() WHERE car_codigo = ? AND car_status = ?",
        ["FINALIZADO", carregamentoId, "EM ANDAMENTO"]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error finalizing carregamento:", error);
      throw error;
    }
  }
}
