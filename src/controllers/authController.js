// src/controllers/authController.js
import crypto from "crypto";

export class AuthController {
  constructor(usuarioRepository) {
    this.usuarioRepo = usuarioRepository;
  }

  async login(req, res) {
    try {
      const { login, senha } = req.body;

      if (!login || !senha) {
        return res.status(400).json({
          success: false,
          message: "Login e senha são obrigatórios",
        });
      }

      const user = await this.usuarioRepo.validateCredentials(login, senha);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Credenciais inválidas",
        });
      }

      // Gerar token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias

      await this.usuarioRepo.saveApiToken(
        user.usu_codigo,
        tokenHash,
        expiresAt.toISOString().slice(0, 19).replace("T", " ")
      );

      return res.json({
        success: true,
        message: "Login bem-sucedido!",
        token,
        userName: user.usu_nome,
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  }

  async authenticate(req) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return {
          success: false,
          message: "Token de autorização não fornecido",
        };
      }

      const match = authHeader.match(/Bearer\s(.+)/);
      if (!match) {
        return {
          success: false,
          message: "Formato de token inválido",
        };
      }

      const token = match[1];
      const user = await this.usuarioRepo.findUserByToken(token);

      if (!user) {
        return {
          success: false,
          message: "Token inválido ou expirado",
        };
      }

      return { success: true, user };
    } catch (error) {
      console.error("Authentication error:", error);
      return {
        success: false,
        message: "Erro de autenticação",
      };
    }
  }
}
