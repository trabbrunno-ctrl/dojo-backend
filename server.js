require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SECRET_KEY = process.env.JWT_SECRET || "seusegredo123";

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ROTA RAIZ
app.get("/", (req, res) => {
  res.send("Backend Dojo Online 🚀");
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuário não encontrado" });
    
    const user = result.rows[0];
    
    // Comparar senha (bcrypt)
    // OBS: Se você criou o user manualmente sem hash, use user.password_hash === password para testar
    // Em produção, use sempre bcrypt.compare
    const match = await bcrypt.compare(password, user.password_hash);
    
    if (!match) return res.status(401).json({ message: "Senha incorreta" });
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        dojo_name: user.dojo_name,
        logo: user.logo_url
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro interno" });
  }
});

// --- ROTAS PROTEGIDAS ---

// GET STUDENTS
app.get("/students", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM students WHERE user_id = $1 ORDER BY nome ASC", [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// CREATE STUDENT
app.post("/students", authenticateToken, async (req, res) => {
  const { nome, whatsapp, email, endereco, modalidade, professor, vencimento, status, pagamentos } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO students (user_id, nome, whatsapp, email, endereco, modalidade, professor, vencimento, status, pagamentos) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.user.id, nome, whatsapp, email, endereco, modalidade, professor, vencimento, status, pagamentos || {}]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// UPDATE STUDENT (PUT)
app.put("/students/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nome, whatsapp, email, endereco, modalidade, professor, vencimento } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE students SET nome=$1, whatsapp=$2, email=$3, endereco=$4, modalidade=$5, professor=$6, vencimento=$7, updated_at=NOW()
       WHERE id=$8 AND user_id=$9 RETURNING *`,
      [nome, whatsapp, email, endereco, modalidade, professor, vencimento, id, req.user.id]
    );
    
    if(result.rows.length === 0) return res.status(404).send("Aluno não encontrado ou sem permissão");
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// UPDATE PAYMENTS (PATCH)
app.patch("/students/:id/payments", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { pagamentos } = req.body; // JSONB object
  
  try {
    const result = await pool.query(
      `UPDATE students SET pagamentos=$1, updated_at=NOW()
       WHERE id=$2 AND user_id=$3 RETURNING *`,
      [pagamentos, id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET DOJO CONFIG
app.get("/dojo-config", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM dojo_config WHERE user_id = $1", [req.user.id]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Retorna padrão se não existir
      res.json({ nomes_modalidades: {}, mapa_professores: {} });
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET FINANCIAL CONFIG
app.get("/financial-config", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM financial_config WHERE user_id = $1", [req.user.id]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({});
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
