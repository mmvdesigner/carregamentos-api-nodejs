// api/index.js
import mysql from "mysql2/promise";
import crypto from "crypto";
import bcrypt from "bcryptjs"; // Adicionado para comparar senhas bcrypt

let dbConnection = null;

async function getDatabase() {
  if (dbConnection && dbConnection.connection._closing === false) {
    return dbConnection;
  }

  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  };

  dbConnection = await mysql.createConnection(config);
  return dbConnection;
}

function setResponseHeaders(res) {
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
}

async function parseRequestBody(req) {
  if (req.body) return req.body;

  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

async function validateToken(req, db) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const match = authHeader.match(/Bearer\s(.+)/);
  if (!match) return null;

  const tokenHash = crypto.createHash("sha256").update(match[1]).digest("hex");

  const [rows] = await db.execute(
    `SELECT usu_codigo AS usu_codigo, usu_nome AS usu_nome 
     FROM tbl_usuarios 
     WHERE usu_session_token = ? AND usu_situacao = 'A'`,
    [tokenHash]
  );

  return rows.length > 0 ? rows[0] : null;
}

export default async function handler(req, res) {
  setResponseHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    req.body = await parseRequestBody(req);
    const db = await getDatabase();
    const action = req.query.action || "";

    switch (action) {
      case "login":
        return await loginHandler(req, res, db);
      case "getDadosNovoCarregamento":
        return await getDadosHandler(req, res, db);
      case "salvarCarregamentoHeader":
        return await salvarHeaderHandler(req, res, db);
      case "salvarFilaComLeituras":
        return await salvarFilaHandler(req, res, db);
      case "finalizarCarregamento":
        return await finalizarHandler(req, res, db);
      default:
        return res.status(404).json({
          success: false,
          message: "Endpoint não encontrado",
        });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
}

async function loginHandler(req, res, db) {
  const { login, senha } = req.body;

  if (!login || !senha) {
    return res.status(400).json({
      success: false,
      message: "Login e senha são obrigatórios",
    });
  }

  try {
    const [rows] = await db.execute(
      "SELECT usu_codigo, usu_nome, usu_senha FROM tbl_usuarios WHERE usu_login = ? AND usu_situacao = 'A'",
      [login]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }

    const user = rows[0];

    // ✅ Compara senha usando bcrypt
    const isValid = await bcrypt.compare(senha, user.usu_senha);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // ✅ Atualiza o token de sessão
    await db.execute(
      "UPDATE tbl_usuarios SET usu_session_token = ? WHERE usu_codigo = ?",
      [tokenHash, user.usu_codigo]
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

async function getDadosHandler(req, res, db) {
  try {
    // 1. Buscar próximo número de carregamento
    const [numeroRows] = await db.execute(
      "SELECT COALESCE(MAX(car_numero), 0) + 1 as proximo FROM tbl_carregamentos"
    );

    // 2. Buscar todos os clientes ativos com os campos necessários
    const [clientes] = await db.execute(
      `
      SELECT 
        ent_codigo,
        ent_razao_social,
        ent_nome_fantasia,
        ent_codigo_interno 
      FROM tbl_entidades 
      WHERE ent_tipo_entidade = ? AND ent_situacao = 'A'
      ORDER BY ent_nome_fantasia
    `,
      ["Cliente"]
    );

    // 🔁 Mapear para estrutura limpa
    const clientesFormatados = clientes.map((c) => ({
      id: c.ent_codigo,
      razaoSocial: c.ent_razao_social,
      nomeFantasia: c.ent_nome_fantasia,
      codigoInterno: c.ent_codigo_interno,
    }));

    // ✅ Retornar resposta correta
    return res.json({
      success: true,
      proximoNumero: numeroRows[0].proximo,
      clientes: clientesFormatados,
    });
  } catch (error) {
    console.error("Error getting dados:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao obter dados",
      error: error.message,
    });
  }
}

async function salvarHeaderHandler(req, res, db) {
  const user = await validateToken(req, db);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Token inválido ou não fornecido",
    });
  }

  const { numero, data, clienteOrganizadorId } = req.body;

  if (!numero || !data || !clienteOrganizadorId) {
    return res.status(400).json({
      success: false,
      message:
        "Campos obrigatórios ausentes: numero, data, clienteOrganizadorId",
    });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO tbl_carregamentos 
       (car_numero, car_data, car_entidade_id_organizador, car_usuario_criacao, car_status) 
       VALUES (?, ?, ?, ?, 'EM ANDAMENTO')`,
      [numero, data, clienteOrganizadorId, user.usu_codigo]
    );

    return res.json({
      success: true,
      message: "Cabeçalho salvo com sucesso!",
      carregamentoId: result.insertId,
    });
  } catch (error) {
    console.error("Error saving header:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao salvar cabeçalho: " + error.message,
    });
  }
}

async function salvarFilaHandler(req, res, db) {
  const user = await validateToken(req, db);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Token inválido ou não fornecido",
    });
  }

  const { carregamentoId, clienteId, leituras } = req.body;

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

  try {
    await db.execute("START TRANSACTION");

    const [filaResult] = await db.execute(
      "INSERT INTO tbl_carregamento_filas (fila_carregamento_id, fila_entidade_id_cliente) VALUES (?, ?)",
      [carregamentoId, clienteId]
    );

    const filaId = filaResult.insertId;

    for (const leitura of leituras) {
      await db.execute(
        "INSERT INTO tbl_carregamento_leituras (cal_fila, cal_codigo_lido, cal_timestamp) VALUES (?, ?, ?)",
        [filaId, leitura.codigo, leitura.timestamp || new Date()]
      );
    }

    await db.execute("COMMIT");

    return res.json({
      success: true,
      message: "Fila e leituras salvas com sucesso!",
      filaId,
    });
  } catch (error) {
    await db.execute("ROLLBACK");
    console.error("Error saving fila:", error);
    return res.status(500).json({
      success: false,
      message: "Erro interno ao salvar a fila",
    });
  }
}

async function finalizarHandler(req, res, db) {
  const user = await validateToken(req, db);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Token inválido ou não fornecido",
    });
  }

  const { carregamentoId } = req.body;

  if (!carregamentoId) {
    return res.status(400).json({
      success: false,
      message: "O ID do carregamento é obrigatório",
    });
  }

  try {
    const [result] = await db.execute(
      "UPDATE tbl_carregamentos SET car_status = ?, car_data_finalizacao = NOW() WHERE car_id = ? AND car_status = ?",
      ["FINALIZADO", carregamentoId, "EM ANDAMENTO"]
    );

    if (result.affectedRows > 0) {
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
    console.error("Error finalizing:", error);
    return res.status(500).json({
      success: false,
      message: "Erro interno ao finalizar o carregamento",
    });
  }
}
