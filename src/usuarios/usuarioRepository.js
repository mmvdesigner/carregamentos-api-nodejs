// src/usuarios/usuarioRepository.js
import crypto from "crypto";

export class UsuarioRepository {
  constructor(db) {
    this.db = db;
  }

  async validateCredentials(login, password) {
    try {
      const [rows] = await this.db.execute(
        "SELECT usu_codigo, usu_nome, usu_senha FROM usuarios WHERE usu_login = ? AND usu_ativo = 1",
        [login]
      );

      if (rows.length === 0) return null;

      const user = rows[0];

      // Assumindo que a senha está hasheada (adapte conforme seu sistema)
      const passwordHash = crypto
        .createHash("md5")
        .update(password)
        .digest("hex");

      if (user.usu_senha === passwordHash) {
        return {
          usu_codigo: user.usu_codigo,
          usu_nome: user.usu_nome,
        };
      }

      return null;
    } catch (error) {
      console.error("Error validating credentials:", error);
      throw error;
    }
  }

  async saveApiToken(userId, tokenHash, expiresAt) {
    try {
      await this.db.execute(
        "UPDATE usuarios SET usu_api_token = ?, usu_token_expires = ? WHERE usu_codigo = ?",
        [tokenHash, expiresAt, userId]
      );
    } catch (error) {
      console.error("Error saving API token:", error);
      throw error;
    }
  }

  async findUserByToken(token) {
    try {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const [rows] = await this.db.execute(
        `SELECT usu_codigo, usu_nome 
         FROM usuarios 
         WHERE usu_api_token = ? 
         AND usu_token_expires > NOW() 
         AND usu_ativo = 1`,
        [tokenHash]
      );

      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error("Error finding user by token:", error);
      throw error;
    }
  }
}
