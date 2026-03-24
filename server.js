const express = require('express');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function autoConfigurarDB() {
    const sql = `CREATE TABLE IF NOT EXISTS articulos (id SERIAL PRIMARY KEY, titulo TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, resumen TEXT, contenido_html TEXT, tags TEXT, categoria TEXT, fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    try { await pool.query(sql); } catch (err) { console.error("Error DB:", err.message); }
}

async function publicarNoticia() {
    // Probamos primero la KEY principal, si no, la 2
    const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY_2;
    
    if (!key) return { ok: false, msg: "No se encontró ninguna llave en Railway Variables." };

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Escribe una noticia SEO sobre economía en RD 2026. Responde SOLO JSON: {"titulo":"...","resumen":"...","contenido":"...","categoria":"...","tags":"..."}`;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        const inicio = text.indexOf('{');
        const fin = text.lastIndexOf('}') + 1;
        if (inicio === -1) throw new Error("La IA no respondió en formato JSON.");

        const data = JSON.parse(text.substring(inicio, fin));
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);

        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6)",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        return { ok: true };
    } catch (e) {
        console.error("DETALLE DEL ERROR:", e.message);
        return { ok: false, msg: "Detalle técnico: " + e.message };
    }
}

app.get('/activar-toro', async (req, res) => {
    const resultado = await publicarNoticia();
    if (resultado.ok) {
        res.send('<h1>🐂 TORO ACTIVO: NOTICIA CREADA</h1><a href="/redaccion.html">Ver Monitor</a>');
    } else {
        res.status(500).send(`
            <div style="font-family:sans-serif; padding:20px; border:2px solid red;">
                <h1 style="color:red;">❌ FALLO DE CONEXIÓN</h1>
                <p><b>Mensaje:</b> ${resultado.msg}</p>
                <hr>
                <p><b>Socio, revisa esto:</b></p>
                <ul>
                    <li>Asegúrate de que no haya espacios en blanco antes o después de la llave en Railway.</li>
                    <li>Verifica que la variable se llame exactamente <b>GEMINI_API_KEY</b>.</li>
                </ul>
                <a href="/redaccion.html">Intentar de nuevo</a>
            </div>
        `);
    }
});

app.get('/api/admin/listado', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC");
        res.json(r.rows);
    } catch (e) { res.status(500).json([]); }
});

app.use(express.static(path.join(__dirname, 'client')));

app.listen(PORT, '0.0.0.0', async () => {
    await autoConfigurarDB();
    console.log("🚀 Motor en puerto " + PORT);
});
