// src/entidades/entidadeRepository.js
export class EntidadeRepository {
  constructor(db) {
    this.db = db;
  }

  async getClienteOptions() {
    try {
      const [rows] = await this.db.execute(
        "SELECT ent_codigo as id, ent_nome as nome FROM entidades WHERE ent_tipo = ? AND ent_ativo = 1 ORDER BY ent_nome",
        ["CLIENTE"]
      );
      return rows;
    } catch (error) {
      console.error("Error getting cliente options:", error);
      throw error;
    }
  }
}
