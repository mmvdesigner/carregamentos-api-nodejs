// src/core/database.js
import mysql from "mysql2/promise";

export class DatabaseConnection {
  static instance = null;
  static connection = null;

  static async getInstance() {
    if (this.connection && this.connection.connection._closing === false) {
      return this.connection;
    }

    const config = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      // Configurações para serverless
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      // Pool de conexões para melhor performance
      connectionLimit: 1, // Serverless precisa de poucos connections
      queueLimit: 0,
    };

    try {
      this.connection = await mysql.createConnection(config);

      // Teste a conexão
      await this.connection.execute("SELECT 1");

      console.log("Database connected successfully");
      return this.connection;
    } catch (error) {
      console.error("Database connection failed:", error);
      throw new Error("Falha na conexão com o banco de dados");
    }
  }

  static async closeConnection() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }
}

// Middleware para parsing do body
export const parseBody = async (req) => {
  return new Promise((resolve) => {
    if (req.body) {
      resolve(req.body);
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        req.body = body ? JSON.parse(body) : {};
        resolve(req.body);
      } catch (error) {
        console.error("Error parsing body:", error);
        req.body = {};
        resolve({});
      }
    });
  });
};
