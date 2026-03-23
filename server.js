/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (PRODUCCIÓN)
 * --------------------------------------------------------
 * 🛠️ CONFIGURACIÓN MAESTRA:
 * 1. FOCO: Innovación, Mercados y Finanzas Digitales.
 * 2. IA: Rotación horaria de 4 llaves Gemini 2.0 (Texto vs Imagen).
 * 3. IMAGEN: Wikimedia Commons + Atribución Profesional (Requisito AdSense).
 * 4. DB: Auto-reparación de tablas para evitar errores en Railway.
 * --------------------------------------------------------
 */

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const cron      = require('node-cron');
const { Pool }  = require('pg');
const sharp     = require('sharp');
const RSSParser = require('rss-parser');
const crypto    = require('crypto');
const cookieParser = require('cookie-parser');

const app      = express();
const PORT     = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'https://faroltech.com';

// 🔒 SEGURIDAD ( director / 311tech )
function authMiddleware(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Redacción Tech"');
        return res.status(401).send('Acceso Tech Restringido');
    }
    const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    if (user === 'director' && pass === '311tech') return next();
    return res.status(401).send('Credenciales Incorrectas');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const rssParser = new RSSParser({ timeout: 15000 });

// ══════════════════════════════════════════════════════════
// 🖼️ MOTOR DE IMÁGENES PROFESIONAL (WIKIMEDIA TECH)
// ══════════════════════════════════════════════════════════
async function buscarImagenTech(query) {
    try {
        const wiki = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + " technology")}&srnamespace=6&format=json&origin=*`;
        const resW = await fetch(wiki);
        const dataW = await resW.json();
        const page = dataW?.query?.search?.[0];

        if (page) {
            const info = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
            const resI = await fetch(info);
            const dataI = await resI.json();
            const ii = Object.values(dataI.query.pages)[0].imageinfo[0];

            if (ii.url.match(/\.(jpg|jpeg|png)$/i)) {
                let autor = ii.extmetadata?.Artist?.value || 'Wikimedia Commons';
                return {
                    url: ii.url,
                    autor: autor.replace(/<[^>]+>/g, '').trim().substring(0, 50),
                    licencia: ii.extmetadata?.LicenseShortName?.value || 'CC BY-SA',
                    fuente: 'wikimedia'
                };
            }
        }
    } catch (e) { console.error('Error imagen:', e.message); }
    return { url: 'https://images.pexels.com/photos/1726074/pexels-photo-1726074.jpeg', autor: 'Pexels', licencia: 'Uso Libre', fuente: 'local' };
}

// ══════════════════════════════════════════════════════════
// 🔑 ROTACIÓN GEMINI (TECH EDITION)
// ══════════════════════════════════════════════════════════
async function llamarIATech(prompt, tipo = 'texto') {
    const hora = new Date().getHours();
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2, process.env.GEMINI_KEY_3, process.env.GEMINI_KEY_4].filter(Boolean);
    const indexBase = (hora % 2 === 0) ? 0 : 2;
    const keyActual = (tipo === 'texto') ? keys[indexBase] : keys[indexBase + 1];

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyActual || keys[0]}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    } catch (e) { return null; }
}

// ══════════════════════════════════════════════════════════
// 📰 GENERADOR DE NOTICIAS DE NEGOCIOS
// ══════════════════════════════════════════════════════════
async function generarNoticiaTech(categoria) {
    console.log(`🚀 Generando Noticia Tech: ${categoria}`);
    try {
        const prompt = `Eres un experto financiero de Bloomberg. Escribe una noticia sobre ${categoria} enfocada en el impacto económico y tecnológico de 2026. 
        Formato: TITULO: [texto] | DESCRIPCION: [texto] | QUERY_FOTO: [3 palabras inglés tech] | CONTENIDO: [5 párrafos]`;

        const respuesta = await llamarIATech(prompt, 'texto');
        if (!respuesta) return;

        let titulo = '', desc = '', query = '', contenido = '';
        respuesta.split('\n').forEach(l => {
            if (l.startsWith('TITULO:')) titulo = l.replace('TITULO:', '').replace(/
