// src/controllers/carregamentoController.js
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export class CarregamentoController {
  constructor(carregamentoRepository, entidadeRepository, usuarioRepository) {
    this.carregamentoRepo = carregamentoRepository;
    this.entidadeRepo = entidadeRepository;
    this.usuarioRepo = usuarioRepository;
  }

  async getDadosNovoCarregamento(req, res) {
    try {
      const [proximoNumero, clientes] = await Promise.all([
        this.carregamentoRepo.getNextNumeroCarregamento(),
        this.entidadeRepo.getClienteOptions(),
      ]);

      return res.json({
        success: true,
        proximoNumero,
        clientes,
      });
    } catch (error) {
      console.error("Error getting dados novo carregamento:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao obter dados para novo carregamento",
      });
    }
  }

  async salvarCarregamentoHeader(req, res) {
    try {
      const { numero, data, clienteOrganizadorId } = req.body;

      // Validação
      if (!numero || !data || !clienteOrganizadorId) {
        return res.status(400).json({
          success: false,
          message:
            "Campos obrigatórios ausentes: numero, data, clienteOrganizadorId",
        });
      }

      const newId = await this.carregamentoRepo.createHeader(
        req.body,
        req.user.usu_codigo
      );

      return res.json({
        success: true,
        message: "Cabeçalho salvo com sucesso!",
        carregamentoId: newId,
      });
    } catch (error) {
      console.error("Error saving carregamento header:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao salvar o cabeçalho: " + error.message,
      });
    }
  }

  async salvarFilaComLeituras(req, res) {
    try {
      const { carregamentoId, clienteId, leituras } = req.body;

      // Validação
      if (
        !carregamentoId ||
        !clienteId ||
        !Array.isArray(leituras) ||
        leituras.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Dados inválidos. É necessário fornecer carregamentoId, clienteId e uma lista de leituras",
        });
      }

      const newFilaId = await this.carregamentoRepo.createFilaWithLeituras(
        carregamentoId,
        clienteId,
        leituras
      );

      return res.json({
        success: true,
        message: "Fila e leituras salvas com sucesso!",
        filaId: newFilaId,
      });
    } catch (error) {
      console.error("Error saving fila com leituras:", error);
      return res.status(500).json({
        success: false,
        message: "Erro interno ao salvar a fila",
      });
    }
  }

  async uploadFotoFila(req, res) {
    try {
      const { filaId } = req.body;
      const foto = req.files?.foto;

      if (!filaId || !foto) {
        return res.status(400).json({
          success: false,
          message: "É necessário enviar uma foto e um filaId válido",
        });
      }

      // Criar diretório se não existir
      const uploadDir = path.join(
        process.cwd(),
        "public",
        "uploads",
        "carregamentos"
      );
      await fs.mkdir(uploadDir, { recursive: true });

      // Gerar nome único
      const fileExtension = path.extname(foto.name);
      const fileName = `fila_${filaId}_${crypto.randomUUID()}${fileExtension}`;
      const filePath = path.join(uploadDir, fileName);

      // Salvar arquivo
      await fs.writeFile(filePath, foto.buffer);

      // Caminho relativo para o banco
      const publicPath = `uploads/carregamentos/${fileName}`;

      // Atualizar no banco
      await this.carregamentoRepo.updateFilaPhotoPath(filaId, publicPath);

      return res.json({
        success: true,
        message: "Foto enviada com sucesso!",
      });
    } catch (error) {
      console.error("Error uploading foto fila:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao salvar o arquivo da foto no servidor",
      });
    }
  }

  async finalizarCarregamento(req, res) {
    try {
      const { carregamentoId } = req.body;

      if (!carregamentoId) {
        return res.status(400).json({
          success: false,
          message: "O ID do carregamento é obrigatório",
        });
      }

      const success = await this.carregamentoRepo.finalize(
        parseInt(carregamentoId)
      );

      if (success) {
        return res.json({
          success: true,
          message: "Carregamento finalizado com sucesso!",
        });
      } else {
        return res.json({
          success: false,
          message:
            'Não foi possível finalizar o carregamento. Verifique se o ID está correto e se o carregamento ainda está "EM ANDAMENTO"',
        });
      }
    } catch (error) {
      console.error("Error finalizing carregamento:", error);
      return res.status(500).json({
        success: false,
        message: "Erro interno ao finalizar o carregamento",
      });
    }
  }
}
