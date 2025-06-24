require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mqtt = require("mqtt");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const TOPIC_DADOS = process.env.TOPIC_DADOS || "geladeira/temperatura";
const TOPIC_ALERTA = process.env.TOPIC_ALERTA || "geladeira/alerta";

const PORT = process.env.PORT || 3001;

const db = new sqlite3.Database("./dados_geladeira.db", (err) => {
  if (err) return console.error("Erro ao abrir o banco:", err.message);
  console.log("[DB] Banco conectado!");
});

function columnExists(tableName, columnName) {
  return new Promise((resolve) => {
    db.get(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        resolve(false);
        return;
      }
      db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
        if (err) {
          resolve(false);
          return;
        }
        const hasColumn = rows.some((row) => row.name === columnName);
        resolve(hasColumn);
      });
    });
  });
}

async function initializeDatabase() {
  const hasHorarioColumn = await columnExists("leituras", "horario");

  if (!hasHorarioColumn) {
    console.log("[DB] Recriando tabela leituras com nova estrutura...");
    db.run("DROP TABLE IF EXISTS leituras");
  }

  db.run(`CREATE TABLE IF NOT EXISTS leituras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperatura REAL,
    umidade REAL,
    horario TEXT,
    data_hora TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS leituras_retroativas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperatura REAL,
    umidade REAL,
    horario TEXT,
    data_hora TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS alertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensagem TEXT,
    data_hora TEXT
  )`);

  console.log("[DB] Tabelas inicializadas com sucesso!");
}

initializeDatabase();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
const destinatario = process.env.DESTINATARIO;

let emailRetroativoEnviado = false;
let ultimaLeituraRetroativa = null;

const app = express();
app.use(cors());
app.use(express.static("public"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USER,
  password: MQTT_PASS,
});

mqttClient.on("connect", () => {
  console.log("[MQTT] Conectado ao broker!");
  mqttClient.subscribe([TOPIC_DADOS, TOPIC_ALERTA], (err) => {
    if (err) console.error("[MQTT] Erro ao inscrever tópicos:", err);
  });
});

mqttClient.on("message", (topic, message) => {
  const msg = message.toString();
  const dataHora = new Date().toISOString();

  if (topic === TOPIC_DADOS) {
    console.log(`[DEBUG] Mensagem recebida: "${msg}"`);

    const isRetroativa = msg.startsWith("RETROATIVO:");
    const payload = isRetroativa ? msg.substring(11) : msg;

    console.log(`[DEBUG] isRetroativa: ${isRetroativa}, payload: "${payload}"`);

    const match = payload.match(
      /Temperatura: ([\d.\-]+) .*Umidade: ([\d.\-]+) .*Horário: (.+)/
    );
    if (match) {
      const temperatura = parseFloat(match[1]);
      const umidade = parseFloat(match[2]);
      const horario = match[3].trim();

      if (isRetroativa) {
        db.run(
          "INSERT INTO leituras_retroativas (temperatura, umidade, horario, data_hora) VALUES (?, ?, ?, ?)",
          [temperatura, umidade, horario, dataHora]
        );
        io.emit("dados_retroativos", {
          temperatura,
          umidade,
          horario,
          dataHora,
        });
        console.log(
          `[DADOS RETROATIVOS] ${temperatura}°C, ${umidade}%, ${horario}`
        );
        ultimaLeituraRetroativa = { temperatura, umidade, horario, dataHora };

        if (!emailRetroativoEnviado) {
          emailRetroativoEnviado = true;

          setTimeout(() => {
            if (ultimaLeituraRetroativa) {
              const emailRetroativo = `📊 Leituras Retroativas Detectadas

O sistema detectou leituras que foram salvas offline durante perda de conexão.

📅 Data/Hora da Leitura Mais Recente: ${ultimaLeituraRetroativa.horario}
🌡️ Temperatura: ${ultimaLeituraRetroativa.temperatura}°C
💧 Umidade: ${ultimaLeituraRetroativa.umidade}%
📡 Recebido em: ${new Date().toLocaleString("pt-BR")}

Estas leituras foram salvas localmente no dispositivo quando não havia conexão com a internet e foram enviadas assim que a conexão foi restabelecida.

Consulte o dashboard para ver todas as leituras retroativas.`;

              transporter.sendMail(
                {
                  from: "dvkdzk@gmail.com",
                  to: destinatario,
                  subject: "Leituras Retroativas - Geladeira IoT",
                  text: emailRetroativo,
                },
                (error, info) => {
                  if (error) {
                    return console.log(
                      "[EMAIL RETROATIVO] Erro ao enviar:",
                      error
                    );
                  }
                  console.log(
                    "[EMAIL RETROATIVO] E-mail enviado:",
                    info.response
                  );
                }
              );
            }

            emailRetroativoEnviado = false;
            ultimaLeituraRetroativa = null;
          }, 5000);
        }
      } else {
        db.run(
          "INSERT INTO leituras (temperatura, umidade, horario, data_hora) VALUES (?, ?, ?, ?)",
          [temperatura, umidade, horario, dataHora]
        );
        io.emit("dados", { temperatura, umidade, horario, dataHora });
        console.log(`[DADOS] ${temperatura}°C, ${umidade}%, ${horario}`);
      }
    } else {
      console.log(`[ERRO] Formato de mensagem não reconhecido: "${payload}"`);
    }
  } else if (topic === TOPIC_ALERTA) {
    db.run("INSERT INTO alertas (mensagem, data_hora) VALUES (?, ?)", [
      msg,
      dataHora,
    ]);
    io.emit("alerta", { mensagem: msg, dataHora });
    console.log(`[ALERTA] ${msg}`);

    transporter.sendMail(
      {
        from: "dvkdzk@gmail.com",
        to: destinatario,
        subject: "Alerta de Temperatura - Geladeira",
        text: msg,
      },
      (error, info) => {
        if (error) {
          return console.log("[EMAIL] Erro ao enviar:", error);
        }
        console.log("[EMAIL] Alerta enviado:", info.response);
      }
    );
  }
});

app.get("/", async (req, res) => {
  try {
    const leituras = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM leituras ORDER BY data_hora DESC LIMIT 10",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const leiturasRetroativas = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM leituras_retroativas ORDER BY data_hora DESC LIMIT 10",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const alertas = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM alertas ORDER BY data_hora DESC LIMIT 10",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.render("dashboard", {
      leituras,
      leiturasRetroativas,
      alertas,
      temperaturaAtual: leituras[0]?.temperatura || null,
      umidadeAtual: leituras[0]?.umidade || null,
      horarioAtual: leituras[0]?.horario || null,
    });
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
    res.status(500).send("Erro interno do servidor");
  }
});

app.get("/api/leituras", (req, res) => {
  db.all(
    "SELECT * FROM leituras ORDER BY data_hora DESC LIMIT 100",
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.get("/api/leituras_retroativas", (req, res) => {
  db.all(
    "SELECT * FROM leituras_retroativas ORDER BY data_hora DESC LIMIT 100",
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.get("/api/alertas", (req, res) => {
  db.all(
    "SELECT * FROM alertas ORDER BY data_hora DESC LIMIT 100",
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

server.listen(PORT, () => {
  console.log(`[SERVER] Rodando em http://localhost:${PORT}`);
});
