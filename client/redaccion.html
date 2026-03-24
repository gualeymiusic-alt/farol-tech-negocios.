/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (VERSIÓN REDACCIÓN PRO)
 * --------------------------------------------------------
 * CONEXIÓN AUTOMÁTICA + SITEMAP + PANEL DE CONTROL
 */
const express = require('express');
const { Pool } = require('pg');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ✅ RUTA DE SALUD (Evita el Rojo en Railway)
app.get('/health', (req, res) => { res.status(200).send('OK'); });

// 🔗 CONEXIÓN A BASE DE DATOS POSTGRES
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ AUTO-CONFIGURAR TABLAS AL INICIAR
async function autoConfigurarDB() {
    const sql = `
        CREATE TABLE IF NOT EXISTS articulos (
            id SERIAL PRIMARY KEY,
            titulo TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            resumen TEXT,
            contenido_html TEXT,
            tags TEXT,
            categoria TEXT,
            fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(sql);
        console.log("✅ DB Conectada y Tabla de Redacción Lista.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 MOTOR DE IA (Gemini con 2 Keys)
async function llamarIA(prompt) {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2].filter(Boolean);
    const keyActual = (new Date().getHours() % 2 === 0) ? keys[0] : (keys[1] || keys[0]);
    try {
        const genAI = new GoogleGenerativeAI(keyActual);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { return null; }
}

// 💰 FUNCIÓN DE PUBLICACIÓN SEO
async function publicarNoticia() {
    console.log("🐂 El Toro está redactando una noticia de alto valor...");
    const promptSEO = `Escribe un artículo SEO profundo sobre tecnología o economía en República Dominicana año 2026. 
    Responde SOLO en JSON: {"titulo":"...","resumen":"...","contenido":"(usa h2 y p)","categoria":"...","tags":"..."}`;
    
    const respuesta = await llamarIA(promptSEO);
    if (!respuesta) return false;
    
    try {
        const cleanRes = respuesta.replace(/```json|```/g, "").trim();
        const data = JSON.parse(cleanRes);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        console.log("💰 Publicación exitosa: " + data.titulo);
        return true;
    } catch (e) { 
        console.log("❌ Error procesando JSON");
        return false; 
    }
}

// ⏱️ PROGRAMACIÓN (CADA 8 HORAS)
cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🚀 RUTAS DE ADMINISTRACIÓN (PANEL DE CONTROL)
app.get('/activar-toro', async (req, res) => {
    const exito = await publicarNoticia();
    if (exito) res.send('<h1>🐂 ¡PUBLICADO CON ÉXITO!</h1><a href="/redaccion.html">Volver al Monitor</a>');
    else res.status(500).send('Error al generar noticia.');
});

app.get('/api/admin/listado', async (req, res) => {
    try {
        const r = await pool.query("SELECT id, titulo, fecha_publicacion, categoria FROM articulos ORDER BY fecha_publicacion DESC");
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/borrar/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM articulos WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📈 GOOGLE SEARCH CONSOLE (SITEMAP DINÁMICO)
app.get('/sitemap.xml', async (req, res) => {
    try {
        const r = await pool.query("SELECT slug, fecha_publicacion FROM articulos");
        let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
        xml += `<url><loc>https://${req.get('host')}/</loc></url>`;
        r.rows.forEach(row => {
            xml += `<url><loc>https://${req.get('host')}/noticia.html?v=${row.slug}</loc><lastmod>${row.fecha_publicacion.toISOString().split('T')[0]}</lastmod></url>`;
        });
        xml += `</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (e) { res.status(500).send("Error generando sitemap"); }
});

// 🌐 API PÚBLICA PARA EL FRONTEND
app.get('/api/noticias', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC LIMIT 10");
    res.json(r.rows);
});

app.get('/api/noticia/:slug', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos WHERE slug = $1", [req.params.slug]);
    res.json(r.rows[0] || { error: "No encontrado" });
});

// 📂 SERVIR ARCHIVOS ESTÁTICOS
app.use(express.static(path.join(__dirname, 'client')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

// 🚀 ENCENDER EL TORO
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Redacción Farol activa en puerto ${PORT}`);
    await autoConfigurarDB();
});
