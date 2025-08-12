// src/core/upload.js
import { IncomingForm } from "formidable";

export const upload = {
  async parseMultipart(req) {
    return new Promise((resolve, reject) => {
      const form = new IncomingForm({
        uploadDir: "/tmp",
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
      });

      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
          return;
        }

        // Converter para o formato esperado
        const parsedFiles = {};
        Object.keys(files).forEach((key) => {
          const file = files[key];
          if (Array.isArray(file)) {
            parsedFiles[key] = file[0];
          } else {
            parsedFiles[key] = file;
          }
        });

        // Merge fields into req.body
        req.body = { ...req.body, ...fields };

        resolve(parsedFiles);
      });
    });
  },
};

// src/core/middleware.js
export const corsMiddleware = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
};

export const jsonMiddleware = async (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (error) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
};

export const errorHandler = (error, req, res, next) => {
  console.error("Unhandled error:", error);

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
};
