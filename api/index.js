// api/index.js
import mysql from "mysql2/promise";
import crypto from "crypto";

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
    acquireTimeout: 60000,
    timeout: 60000,
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
    `SELECT codigo AS usu_codigo, nome AS usu_nome 
     FROM usuarios 
     WHERE api_token = ? AND token_expires > NOW() AND ativo = 1`,
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
      "SELECT codigo AS usu_codigo, nome AS usu_nome, senha AS usu_senha FROM usuarios WHERE login = ? AND ativo = 1",
      [login]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }

    const user = rows[0];
    const passwordHash = crypto.createHash("md5").update(senha).digest("hex");

    if (user.usu_senha !== passwordHash) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.execute(
      "UPDATE usuarios SET api_token = ?, token_expires = ? WHERE codigo = ?",
      [
        tokenHash,
        expiresAt.toISOString().slice(0, 19).replace("T", " "),
        user.usu_codigo,
      ]
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
    const [numeroRows] = await db.execute(
      "SELECT COALESCE(MAX(car_numero), 0) + 1 as proximo FROM carregamentos"
    );

    const [clienteRows] = await db.execute(
      "SELECT codigo AS id, nome FROM entidades WHERE tipo = ? AND ativo = 1 ORDER BY nome",
      ["CLIENTE"]
    );

    return res.json({
      success: true,
      proximoNumero: numeroRows[0].proximo,
      clientes: clienteRows,
    });
  } catch (error) {
    console.error("Error getting dados:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao obter dados",
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
      `INSERT INTO carregamentos 
       (car_numero, car_data, car_cliente_organizador, car_usuario_criacao, car_status) 
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
      "INSERT INTO carregamento_filas (caf_carregamento, caf_cliente) VALUES (?, ?)",
      [carregamentoId, clienteId]
    );

    const filaId = filaResult.insertId;

    for (const leitura of leituras) {
      await db.execute(
        "INSERT INTO carregamento_leituras (cal_fila, cal_codigo_lido, cal_timestamp) VALUES (?, ?, ?)",
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
      "UPDATE carregamentos SET car_status = ?, car_data_finalizacao = NOW() WHERE car_codigo = ? AND car_status = ?",
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
