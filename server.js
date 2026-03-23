/**
 * 🐂 SERVIDOR TECH & NEGOCIOS — V1.0
 * --------------------------------------------------------
 * Basado en la arquitectura de El Farol al Día
 * Enfoque: Mercado de Valores, IA y Emprendimiento.
 * --------------------------------------------------------
 */

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const { Pool }  = require('pg');
const cron      = require('node-cron');
const RSSParser = require('rss-parser');

const app      = express();
const PORT     = process.env.PORT || 8080;

// Configuración de la Base de Datos para el nuevo proyecto
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const rssParser = new RSSParser();

// ══════════════════════════════════════════════════════════
// 🗄️ INICIALIZACIÓN DE TABLAS (Repitiendo éxito de EFD)
// ══════════════════════════════════════════════════════════
async function prepararTablas() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS noticias_tech (
                id SERIAL PRIMARY KEY,
                titulo TEXT NOT NULL,
                slug TEXT UNIQUE,
                seccion TEXT, -- 'Tecnología' o 'Negocios'
                contenido TEXT,
                imagen TEXT,
                imagen_autor TEXT,
                imagen_licencia TEXT,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tablas Tech listas en la base de datos.');
    } finally {
        client.release();
    }
}

// ══════════════════════════════════════════════════════════
// 📡 FUENTES DE NOTICIAS (TechCrunch, Wired, Bloomberg)
// ══════════════════════════════════════════════════════════
const FUENTES_NEGOCIOS = [
    { nombre: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { nombre: 'Wired', url: 'https://www.wired.com/feed/rss' }
];

// ══════════════════════════════════════════════════════════
// 🚀 ARRANQUE DEL SERVIDOR
// ══════════════════════════════════════════════════════════
app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.send('🐂 Servidor de Tecnología y Negocios Activo');
});

// Ruta para ver las noticias tech
app.get('/api/tech', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM noticias_tech ORDER BY fecha DESC LIMIT 20');
        res.json(r.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

async function iniciarProyecto() {
    await prepararTablas();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Nuevo servidor iniciado en puerto ${PORT}`);
    });
}

iniciarProyecto();
