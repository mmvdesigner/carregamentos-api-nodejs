// api/index.js - Endpoint principal da API
import { createRouter } from "../src/core/router.js";
import { DatabaseConnection } from "../src/core/database.js";
import { UsuarioRepository } from "../src/usuarios/usuarioRepository.js";
import { CarregamentoRepository } from "../src/carregamentos/carregamentoRepository.js";
import { EntidadeRepository } from "../src/entidades/entidadeRepository.js";
import {
  corsMiddleware,
  jsonMiddleware,
  errorHandler,
} from "../src/core/middleware.js";

// Configuração CORS e headers
const setCorsHeaders = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.setHeader("Content-Type", "application/json");
};

export default async function handler(req, res) {
  setCorsHeaders(res);

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Inicializar conexões e repositórios
    const db = await DatabaseConnection.getInstance();
    const usuarioRepo = new UsuarioRepository(db);
    const carregamentoRepo = new CarregamentoRepository(db);
    const entidadeRepo = new EntidadeRepository(db);

    // Criar router com contexto
    const router = createRouter({
      usuarioRepo,
      carregamentoRepo,
      entidadeRepo,
    });

    // Processar rota
    await router.handle(req, res);
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
}
