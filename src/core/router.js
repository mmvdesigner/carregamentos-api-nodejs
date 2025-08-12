// src/core/router.js
import { AuthController } from "../controllers/authController.js";
import { CarregamentoController } from "../controllers/carregamentoController.js";
import { upload } from "./upload.js";

export function createRouter(repositories) {
  const authController = new AuthController(repositories.usuarioRepo);
  const carregamentoController = new CarregamentoController(
    repositories.carregamentoRepo,
    repositories.entidadeRepo,
    repositories.usuarioRepo
  );

  const routes = {
    login: {
      method: "POST",
      handler: authController.login.bind(authController),
      auth: false,
    },
    getDadosNovoCarregamento: {
      method: "GET",
      handler: carregamentoController.getDadosNovoCarregamento.bind(
        carregamentoController
      ),
      auth: false, // Você mencionou que futuramente terá auth
    },
    salvarCarregamentoHeader: {
      method: "POST",
      handler: carregamentoController.salvarCarregamentoHeader.bind(
        carregamentoController
      ),
      auth: true,
    },
    salvarFilaComLeituras: {
      method: "POST",
      handler: carregamentoController.salvarFilaComLeituras.bind(
        carregamentoController
      ),
      auth: true,
    },
    uploadFotoFila: {
      method: "POST",
      handler: carregamentoController.uploadFotoFila.bind(
        carregamentoController
      ),
      auth: true,
      upload: true,
    },
    finalizarCarregamento: {
      method: "POST",
      handler: carregamentoController.finalizarCarregamento.bind(
        carregamentoController
      ),
      auth: true,
    },
  };

  return {
    async handle(req, res) {
      const action =
        req.query.action || req.url.split("?")[1]?.split("=")[1] || "";
      const route = routes[action];

      if (!route) {
        return res.status(404).json({
          success: false,
          message: "Endpoint não encontrado",
        });
      }

      // Verificar método HTTP
      if (route.method !== req.method) {
        return res.status(405).json({
          success: false,
          message: `Método ${req.method} não permitido para esta rota`,
        });
      }

      try {
        // Middleware de autenticação
        if (route.auth) {
          const authResult = await authController.authenticate(req);
          if (!authResult.success) {
            return res.status(401).json(authResult);
          }
          req.user = authResult.user;
        }

        // Middleware de upload (se necessário)
        if (route.upload) {
          req.files = await upload.parseMultipart(req);
        }

        // Executar handler da rota
        await route.handler(req, res);
      } catch (error) {
        console.error(`Error in ${action}:`, error);
        return res.status(500).json({
          success: false,
          message: "Erro interno do servidor",
        });
      }
    },
  };
}
