/**
 * 🐂 FAROL TECH & NEGOCIOS — server.js V2.0
 * Dominio: faroltech.com
 * Nicho: Tecnología + Economía · República Dominicana
 * Motor: Gemini 2.5 Flash (API REST directa — sin SDK, más estable)
 * Hosting: Railway + PostgreSQL
 * Monetización: Google AdSense pub-XXXXXXXXXXXXXXXX
 *
 * MEJORAS vs código base:
 *  - Gemini via fetch directo (sin SDK de Google — evita errores de versión)
 *  - Rotación de 2 llaves API con rescate automático
 *  - Cron: 1 artículo/hora, categoría rotativa
 *  - RSS: 20 fuentes de Tech + Economía RD/LatAm
 *  - Sitemap.xml dinámico para Google News
 *  - Sistema de memoria (evita repetir temas)
 *  - Panel /redaccion protegido con Basic Auth
 *  - Imágenes: Pexels API + banco local por categoría
 *  - SEO completo: schema.org NewsArticle, OG, Twitter Cards
 *  - AdSense: ads.txt servido automáticamente
 */

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const fs          = require('fs');
const cron        = require('node-cron');
const { Pool }    = require('pg');
const RSSParser   = require('rss-parser');
const cookieParser = require('cookie-parser');
const crypto      = require('crypto');

// ══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════
const app      = express();
const PORT     = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || 'https://faroltech.com';
const ADSENSE_PUB = process.env.ADSENSE_PUB || 'pub-XXXXXXXXXXXXXXXX'; // ← tu ID de AdSense

if (!process.env.DATABASE_URL)   { console.error('❌ DATABASE_URL requerido');  process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error('❌ GEMINI_API_KEY requerido'); process.exit(1); }

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || null;

// ══════════════════════════════════════════════════════════
// 🔒 BASIC AUTH — Panel /redaccion
// ══════════════════════════════════════════════════════════
const AUTH_USER = process.env.ADMIN_USER || 'director';
const AUTH_PASS = process.env.ADMIN_PASS || '311';

function authMiddleware(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Farol Tech — Redacción"');
        return res.status(401).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Acceso Restringido</title>
<style>body{background:#050a05;color:#00ff88;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#0a140a;border:1px solid #00ff88;border-radius:8px;padding:40px;text-align:center;max-width:380px}
h2{color:#00ff88;font-size:18px;margin-bottom:16px}p{color:#667;font-size:13px;margin-bottom:20px;line-height:1.6}
a{display:inline-block;background:#00ff88;color:#050a05;padding:10px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-family:monospace}</style>
</head><body><div class="box"><h2>🐂 ACCESO RESTRINGIDO</h2><p>Panel de Redacción<br><br>Usuario: <strong>${AUTH_USER}</strong><br>Contraseña: <strong>${AUTH_PASS}</strong></p>
<a href="/redaccion">ENTRAR</a></div></body></html>`);
    }
    try {
        const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
        const [user, ...p] = decoded.split(':');
        if (user === AUTH_USER && p.join(':') === AUTH_PASS) return next();
    } catch(e) {}
    res.setHeader('WWW-Authenticate', 'Basic realm="Farol Tech — Redacción"');
    return res.status(401).send('Credenciales incorrectas');
}

// ══════════════════════════════════════════════════════════
// BASE DE DATOS
// ══════════════════════════════════════════════════════════
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','OPTIONS'] }));
app.options('*', cors());
app.use(express.static(path.join(__dirname, 'client'), {
    setHeaders: (res, fp) => {
        if (/\.(jpg|png|webp|ico|svg)$/i.test(fp)) res.setHeader('Cache-Control', 'public,max-age=2592000');
        else if (/\.(css|js)$/i.test(fp)) res.setHeader('Cache-Control', 'public,max-age=86400');
    }
}));

// ══════════════════════════════════════════════════════════
// INICIALIZAR BASE DE DATOS
// ══════════════════════════════════════════════════════════
async function inicializarDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS articulos (
                id               SERIAL PRIMARY KEY,
                titulo           VARCHAR(300) NOT NULL,
                slug             VARCHAR(300) UNIQUE,
                resumen          VARCHAR(300),
                contenido_html   TEXT,
                tags             VARCHAR(300),
                categoria        VARCHAR(100),
                imagen           TEXT,
                imagen_alt       VARCHAR(255),
                autor            VARCHAR(100) DEFAULT 'Redacción FT',
                modelo_usado     VARCHAR(100) DEFAULT 'gemini-2.5-flash',
                vistas           INTEGER DEFAULT 0,
                fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                estado           VARCHAR(50) DEFAULT 'publicado'
            )
        `);

        // Columnas adicionales para versiones futuras
        for (const col of [
            'imagen TEXT', 'imagen_alt VARCHAR(255)',
            'autor VARCHAR(100)', 'vistas INTEGER DEFAULT 0',
            'estado VARCHAR(50) DEFAULT \'publicado\''
        ]) {
            const nombre = col.split(' ')[0];
            await client.query(`
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='articulos' AND column_name='${nombre}')
                    THEN ALTER TABLE articulos ADD COLUMN ${col}; END IF;
                END $$;
            `).catch(() => {});
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS memoria_temas (
                id        SERIAL PRIMARY KEY,
                titulo    VARCHAR(300),
                categoria VARCHAR(100),
                fecha     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS rss_procesados (
                id        SERIAL PRIMARY KEY,
                guid      VARCHAR(500) UNIQUE,
                fuente    VARCHAR(100),
                fecha     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ BD lista — Farol Tech V2.0');
    } catch (e) { console.error('❌ BD:', e.message); }
    finally { client.release(); }
}

// ══════════════════════════════════════════════════════════
// 🤖 GEMINI 2.5 FLASH — fetch directo, rotación 2 llaves
// ══════════════════════════════════════════════════════════
const GEMINI_MODEL = 'gemini-2.5-flash';
const geminiState  = {};

function keyState(key) {
    if (!geminiState[key]) geminiState[key] = { last: 0, reset: 0 };
    return geminiState[key];
}

async function _callGemini(apiKey, prompt, intento = 0) {
    const st = keyState(apiKey);
    if (Date.now() < st.reset) await new Promise(r => setTimeout(r, Math.min(st.reset - Date.now(), 12000)));
    const gap = Date.now() - st.last;
    if (gap < 3000) await new Promise(r => setTimeout(r, 3000 - gap));
    st.last = Date.now();

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.75, maxOutputTokens: 3500 }
            })
        }
    );

    if (res.status === 429) {
        st.reset = Date.now() + Math.pow(2, intento) * 6000;
        throw new Error('RATE_LIMIT_429');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) throw new Error('Gemini: respuesta vacía');
    return texto;
}

async function llamarGemini(prompt, reintentos = 3) {
    const llaves = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_KEY_2,
    ].filter(Boolean);

    for (let i = 0; i < reintentos; i++) {
        for (const llave of llaves) {
            try {
                const texto = await _callGemini(llave, prompt, i);
                return texto;
            } catch (err) {
                if (err.message === 'RATE_LIMIT_429') { console.warn('   ⚡ 429 → rotando llave...'); continue; }
                console.error(`   ❌ Gemini: ${err.message}`);
            }
        }
        if (i < reintentos - 1) await new Promise(r => setTimeout(r, Math.pow(2, i) * 4000));
    }
    throw new Error('Gemini: todas las llaves fallaron');
}

// ══════════════════════════════════════════════════════════
// CATEGORÍAS Y TEMAS
// ══════════════════════════════════════════════════════════
const CATEGORIAS = [
    'Tecnología RD',
    'Economía RD',
    'Finanzas Personales',
    'Startups & Emprendimiento',
    'Mercados Internacionales',
    'Innovación & Futuro',
];

const AUTORES = {
    'Tecnología RD':           'Miguel Ángel Vargas',
    'Economía RD':             'Carmen Díaz Torres',
    'Finanzas Personales':     'Rodrigo Alcántara',
    'Startups & Emprendimiento':'Valeria Montero',
    'Mercados Internacionales':'Eduardo Sánchez',
    'Innovación & Futuro':     'Sofía Reyes',
};

function slugify(t) {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,90);
}

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ══════════════════════════════════════════════════════════
// IMÁGENES — Pexels + banco local
// ══════════════════════════════════════════════════════════
const PB  = 'https://images.pexels.com/photos';
const OPT = '?auto=compress&cs=tinysrgb&w=900';

const BANCO_IMAGENES = {
    'Tecnología RD': [
        `${PB}/3861958/pexels-photo-3861958.jpeg${OPT}`,
        `${PB}/1181244/pexels-photo-1181244.jpeg${OPT}`,
        `${PB}/574071/pexels-photo-574071.jpeg${OPT}`,
        `${PB}/3861969/pexels-photo-3861969.jpeg${OPT}`,
        `${PB}/5926382/pexels-photo-5926382.jpeg${OPT}`,
    ],
    'Economía RD': [
        `${PB}/4386466/pexels-photo-4386466.jpeg${OPT}`,
        `${PB}/210607/pexels-photo-210607.jpeg${OPT}`,
        `${PB}/3532557/pexels-photo-3532557.jpeg${OPT}`,
        `${PB}/6801648/pexels-photo-6801648.jpeg${OPT}`,
        `${PB}/7567443/pexels-photo-7567443.jpeg${OPT}`,
    ],
    'Finanzas Personales': [
        `${PB}/4386467/pexels-photo-4386467.jpeg${OPT}`,
        `${PB}/6120214/pexels-photo-6120214.jpeg${OPT}`,
        `${PB}/5849559/pexels-photo-5849559.jpeg${OPT}`,
        `${PB}/6772070/pexels-photo-6772070.jpeg${OPT}`,
        `${PB}/4386466/pexels-photo-4386466.jpeg${OPT}`,
    ],
    'Startups & Emprendimiento': [
        `${PB}/3183197/pexels-photo-3183197.jpeg${OPT}`,
        `${PB}/3184418/pexels-photo-3184418.jpeg${OPT}`,
        `${PB}/3182812/pexels-photo-3182812.jpeg${OPT}`,
        `${PB}/1552252/pexels-photo-1552252.jpeg${OPT}`,
        `${PB}/3184339/pexels-photo-3184339.jpeg${OPT}`,
    ],
    'Mercados Internacionales': [
        `${PB}/358319/pexels-photo-358319.jpeg${OPT}`,
        `${PB}/2860705/pexels-photo-2860705.jpeg${OPT}`,
        `${PB}/3997992/pexels-photo-3997992.jpeg${OPT}`,
        `${PB}/3407617/pexels-photo-3407617.jpeg${OPT}`,
        `${PB}/1602726/pexels-photo-1602726.jpeg${OPT}`,
    ],
    'Innovación & Futuro': [
        `${PB}/2582937/pexels-photo-2582937.jpeg${OPT}`,
        `${PB}/3932499/pexels-photo-3932499.jpeg${OPT}`,
        `${PB}/4050315/pexels-photo-4050315.jpeg${OPT}`,
        `${PB}/7988086/pexels-photo-7988086.jpeg${OPT}`,
        `${PB}/5632399/pexels-photo-5632399.jpeg${OPT}`,
    ],
};

const PEXELS_QUERIES = {
    'Tecnología RD':           ['technology innovation digital dominican republic','software developer coding computer','tech startup team office caribbean'],
    'Economía RD':             ['dominican republic business economy professionals','latin america financial district bank','caribbean business meeting executives'],
    'Finanzas Personales':     ['personal finance money management professional','banking financial planning savings','investment portfolio finance professional'],
    'Startups & Emprendimiento':['startup team working office innovation','entrepreneur business meeting presentation','small business owner professional office'],
    'Mercados Internacionales':['international stock market trading finance','global business financial district skyline','world markets trading charts professional'],
    'Innovación & Futuro':     ['artificial intelligence technology future','innovation lab research technology professional','digital transformation future technology'],
};

async function buscarImagenPexels(categoria) {
    if (!PEXELS_API_KEY) return null;
    const queries = PEXELS_QUERIES[categoria] || PEXELS_QUERIES['Tecnología RD'];
    for (const q of queries) {
        try {
            const ctrl = new AbortController();
            const tm = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=landscape`,
                { headers: { Authorization: PEXELS_API_KEY }, signal: ctrl.signal }
            ).finally(() => clearTimeout(tm));
            if (!res.ok) continue;
            const data = await res.json();
            if (!data.photos?.length) continue;
            const foto = data.photos[Math.floor(Math.random() * Math.min(5, data.photos.length))];
            return foto.src.large2x || foto.src.large;
        } catch { continue; }
    }
    return null;
}

function imagenLocal(categoria) {
    const banco = BANCO_IMAGENES[categoria] || BANCO_IMAGENES['Tecnología RD'];
    return banco[Math.floor(Math.random() * banco.length)];
}

async function obtenerImagen(categoria) {
    const pexels = await buscarImagenPexels(categoria);
    return pexels || imagenLocal(categoria);
}

// ══════════════════════════════════════════════════════════
// MEMORIA — evita repetir temas
// ══════════════════════════════════════════════════════════
async function obtenerTitulosRecientes() {
    try {
        const r = await pool.query('SELECT titulo FROM articulos ORDER BY fecha_publicacion DESC LIMIT 20');
        return r.rows.map(x => x.titulo);
    } catch { return []; }
}

async function registrarTema(titulo, categoria) {
    try {
        await pool.query('INSERT INTO memoria_temas(titulo,categoria) VALUES($1,$2)', [titulo, categoria]);
    } catch(e) {}
}

// ══════════════════════════════════════════════════════════
// 📰 GENERAR ARTÍCULO
// ══════════════════════════════════════════════════════════
async function generarArticulo(categoria, comunicadoExterno = null) {
    try {
        const recientes  = await obtenerTitulosRecientes();
        const noRepetir  = recientes.length ? `\n⛔ YA PUBLICADOS — no repetir:\n${recientes.slice(0,12).map((t,i)=>`${i+1}. ${t}`).join('\n')}\n` : '';

        const fuenteTexto = comunicadoExterno
            ? `\nCOMUNICADO OFICIAL:\n"""\n${comunicadoExterno}\n"""\nRedacta un artículo profesional basado en este comunicado. Reescribe con tu estilo, no copies textualmente.`
            : `\nEscribe un artículo nuevo sobre la categoría "${categoria}" enfocado en República Dominicana, marzo 2026.`;

        const prompt = `Eres el editor jefe de Farol Tech & Negocios, el portal líder de Tecnología y Economía de República Dominicana. Escribes con el rigor de Bloomberg pero la cercanía del periodismo caribeño.

CATEGORÍA: ${categoria}
FECHA: Marzo 2026
AUDIENCIA: Ejecutivos, emprendedores y profesionales dominicanos
${noRepetir}
${fuenteTexto}

ESTRUCTURA DEL ARTÍCULO:
- Párrafo 1 LEAD: El dato o hecho más impactante primero. Máximo 3 líneas.
- Párrafo 2 CONTEXTO: Cifras reales, porcentajes, comparación con período anterior.
- Párrafo 3 ANÁLISIS: ¿Por qué importa esto para RD? Fuente o experto citado.
- Párrafo 4 IMPACTO PRÁCTICO: ¿Qué significa para empresas/personas en RD?
- Párrafo 5 PERSPECTIVA: Tendencia regional Caribe/LatAm. Próximos pasos.

REGLAS SEO GOOGLE NEWS 2026:
- Título: 60-70 chars, incluye dato concreto + actor + contexto RD
- Descripción: exactamente 150-160 caracteres
- Tags: 5 keywords, primera siempre "tecnología república dominicana" o "economía república dominicana"
- Extensión: 380-450 palabras

RESPONDE EXACTAMENTE EN ESTE FORMATO (sin markdown adicional):
TITULO: [título]
DESCRIPCION: [descripción SEO 150-160 chars]
TAGS: [tag1, tag2, tag3, tag4, tag5]
CONTENIDO_HTML:
[El artículo completo en HTML limpio usando solo <p>, <h2>, <strong>, <em>. Sin <html>, <body> ni clases CSS.]`;

        console.log(`\n📰 Generando: ${categoria}${comunicadoExterno ? ' (RSS)' : ''}`);
        const respuesta = await llamarGemini(prompt);
        const limpio = respuesta.replace(/```html?|```/gi, '').trim();

        let titulo = '', desc = '', tags = '', html = '';
        let enContenido = false;
        const lineas = [];

        for (const linea of limpio.split('\n')) {
            const t = linea.trim();
            if      (t.startsWith('TITULO:'))         titulo = t.replace('TITULO:','').trim();
            else if (t.startsWith('DESCRIPCION:'))    desc   = t.replace('DESCRIPCION:','').trim();
            else if (t.startsWith('TAGS:'))           tags   = t.replace('TAGS:','').trim();
            else if (t.startsWith('CONTENIDO_HTML:')) enContenido = true;
            else if (enContenido && t.length > 0)     lineas.push(t);
        }
        html  = lineas.join('\n');
        titulo = titulo.replace(/[*_#`"]/g,'').trim();
        desc   = desc.replace(/[*_#`]/g,'').trim();

        if (!titulo) throw new Error('Gemini no devolvió TITULO');
        if (!html || html.length < 200) throw new Error(`Contenido HTML insuficiente (${html.length} chars)`);

        console.log(`   📝 ${titulo}`);

        const imagen = await obtenerImagen(categoria);
        const altImg = `${titulo.substring(0,60)} — Farol Tech & Negocios`;
        const autor  = AUTORES[categoria] || 'Redacción FT';
        const sl     = slugify(titulo);
        const existe = await pool.query('SELECT id FROM articulos WHERE slug=$1', [sl]);
        const slFin  = existe.rows.length ? `${sl}-${Date.now()}` : sl;

        await pool.query(
            `INSERT INTO articulos(titulo,slug,resumen,contenido_html,tags,categoria,imagen,imagen_alt,autor,modelo_usado,estado)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [titulo.substring(0,300), slFin, desc.substring(0,300), html,
             tags.substring(0,300), categoria, imagen, altImg.substring(0,255),
             autor, GEMINI_MODEL, 'publicado']
        );

        await registrarTema(titulo, categoria);
        console.log(`\n✅ /articulo/${slFin}`);
        invalidarCache();

        return { ok: true, titulo, slug: slFin, categoria };
    } catch (e) {
        console.error('❌', e.message);
        return { ok: false, msg: e.message };
    }
}

// ══════════════════════════════════════════════════════════
// FUENTES RSS — Tech + Economía
// ══════════════════════════════════════════════════════════
const FUENTES_RSS = [
    // RD — Economía
    { url: 'https://www.eldinero.com.do/feed/',          cat: 'Economía RD',             nombre: 'El Dinero RD' },
    { url: 'https://www.bancentral.gov.do/feed',         cat: 'Economía RD',             nombre: 'Banco Central RD' },
    { url: 'https://mepyd.gob.do/feed',                  cat: 'Economía RD',             nombre: 'MEPyD' },
    { url: 'https://acento.com.do/feed/',                cat: 'Economía RD',             nombre: 'Acento Economía' },
    // RD — Tech
    { url: 'https://www.diariolibre.com/feed',           cat: 'Tecnología RD',           nombre: 'Diario Libre Tech' },
    { url: 'https://listindiario.com/feed',              cat: 'Tecnología RD',           nombre: 'Listín Tech' },
    // LatAm — Economía
    { url: 'https://feeds.bloomberg.com/markets/news.rss', cat: 'Mercados Internacionales', nombre: 'Bloomberg Markets' },
    { url: 'https://www.reuters.com/arc/outboundfeeds/rss/category/business/?outputType=xml', cat: 'Mercados Internacionales', nombre: 'Reuters Business' },
    { url: 'https://feeds.bbci.co.uk/mundo/rss.xml',    cat: 'Economía RD',             nombre: 'BBC Mundo Economía' },
    // Tech Internacional
    { url: 'https://feeds.feedburner.com/TechCrunch',   cat: 'Innovación & Futuro',     nombre: 'TechCrunch' },
    { url: 'https://www.wired.com/feed/rss',            cat: 'Innovación & Futuro',     nombre: 'Wired' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', cat: 'Tecnología RD', nombre: 'NYT Tech' },
    // Startups
    { url: 'https://feeds.feedburner.com/entrepreneur/latest', cat: 'Startups & Emprendimiento', nombre: 'Entrepreneur' },
    { url: 'https://feeds.harvardbusiness.org/harvardbusiness/', cat: 'Finanzas Personales', nombre: 'Harvard Business Review' },
];

const rssParser = new RSSParser({ timeout: 10000 });

async function procesarRSS() {
    console.log('\n📡 Procesando RSS Farol Tech...');
    let procesadas = 0;
    for (const fuente of FUENTES_RSS) {
        try {
            const feed = await rssParser.parseURL(fuente.url).catch(() => null);
            if (!feed?.items?.length) continue;
            for (const item of feed.items.slice(0, 2)) {
                const guid = item.guid || item.link || item.title;
                if (!guid) continue;
                const ya = await pool.query('SELECT id FROM rss_procesados WHERE guid=$1', [guid.substring(0,500)]);
                if (ya.rows.length) continue;
                const com = [
                    item.title    ? `TÍTULO: ${item.title}` : '',
                    item.contentSnippet ? `RESUMEN: ${item.contentSnippet}` : '',
                    item.content  ? `CONTENIDO: ${item.content?.substring(0,2000)}` : '',
                    `FUENTE: ${fuente.nombre}`
                ].filter(Boolean).join('\n');
                const r = await generarArticulo(fuente.cat, com);
                if (r.ok) {
                    await pool.query('INSERT INTO rss_procesados(guid,fuente) VALUES($1,$2) ON CONFLICT DO NOTHING', [guid.substring(0,500), fuente.nombre]);
                    procesadas++;
                    await new Promise(r => setTimeout(r, 5000));
                }
                break;
            }
        } catch (err) { console.warn(`   ⚠️ ${fuente.nombre}: ${err.message}`); }
    }
    console.log(`📡 RSS: ${procesadas} artículos nuevos`);
}

// ══════════════════════════════════════════════════════════
// CRON — 1 artículo/hora + RSS 3x día
// ══════════════════════════════════════════════════════════
const ARRANQUE = Date.now();

// Keep-alive Railway
cron.schedule('*/5 * * * *', async () => {
    try { await fetch(`http://localhost:${PORT}/health`); } catch(e) {}
});

// 1 artículo/hora — minuto 0, categoría rotativa
cron.schedule('0 * * * *', async () => {
    if (Date.now() - ARRANQUE < 40 * 60 * 1000) return; // no interferir con ráfaga inicial
    const hora = new Date().getHours();
    const cat  = CATEGORIAS[hora % CATEGORIAS.length];
    console.log(`⏰ Cron ${hora}h → ${cat}`);
    await generarArticulo(cat);
});

// RSS: 7:30am, 1:30pm, 8:30pm
cron.schedule('30 7,13,20 * * *', async () => {
    await procesarRSS();
});

// ══════════════════════════════════════════════════════════
// RÁFAGA INICIAL — 3 artículos al arrancar (20 min entre c/u)
// ══════════════════════════════════════════════════════════
async function rafagaInicial() {
    const INTERVALO = 20;
    console.log(`\n🚀 RÁFAGA INICIAL — 3 artículos · ${INTERVALO} min entre cada uno\n`);
    const cats = ['Tecnología RD', 'Economía RD', 'Mercados Internacionales'];
    for (let i = 0; i < cats.length; i++) {
        if (i > 0) {
            console.log(`⏳ Esperando ${INTERVALO} min (artículo ${i+1}/3)...`);
            await new Promise(r => setTimeout(r, INTERVALO * 60 * 1000));
        }
        await generarArticulo(cats[i]);
    }
    console.log('\n✅ Ráfaga completa — ritmo: 1 artículo/hora\n');
}

// ══════════════════════════════════════════════════════════
// CACHE
// ══════════════════════════════════════════════════════════
let _cache = null, _cacheFecha = 0;
const CACHE_TTL = 60000;
function invalidarCache() { _cache = null; _cacheFecha = 0; }

// ══════════════════════════════════════════════════════════
// SEO — Schema.org + Meta Tags
// ══════════════════════════════════════════════════════════
function metaTags(a, url) {
    const t   = esc(a.titulo);
    const d   = esc(a.resumen || '');
    const img = esc(a.imagen || `${PB}/3861958/pexels-photo-3861958.jpeg${OPT}`);
    const fi  = new Date(a.fecha_publicacion).toISOString();
    const wc  = (a.contenido_html || '').replace(/<[^>]+>/g,'').split(/\s+/).filter(w=>w).length;

    const schema = {
        "@context":"https://schema.org","@type":"NewsArticle",
        "mainEntityOfPage":{"@type":"WebPage","@id":url},
        "headline":a.titulo, "description":a.resumen||'',
        "image":{"@type":"ImageObject","url":a.imagen,"width":900,"height":500},
        "datePublished":fi, "dateModified":fi,
        "author":{"@type":"Person","name":a.autor||'Redacción FT'},
        "publisher":{"@type":"NewsMediaOrganization","name":"Farol Tech & Negocios",
            "url":BASE_URL,"logo":{"@type":"ImageObject","url":`${BASE_URL}/favicon.png`}},
        "articleSection":a.categoria, "wordCount":wc, "inLanguage":"es-DO",
        "isAccessibleForFree":true
    };

    return `<title>${t} | Farol Tech & Negocios</title>
<meta name="description" content="${d}">
<meta name="keywords" content="${esc(a.tags||a.categoria)}">
<meta name="author" content="${esc(a.autor||'Redacción FT')}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Farol Tech & Negocios">
<meta property="og:locale" content="es_DO">
<meta property="article:published_time" content="${fi}">
<meta property="article:section" content="${esc(a.categoria)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// ══════════════════════════════════════════════════════════
// RUTAS API
// ══════════════════════════════════════════════════════════
app.get('/health', (req, res) => res.json({ status: 'OK', version: '2.0', proyecto: 'Farol Tech & Negocios' }));

app.get('/api/articulos', async (req, res) => {
    res.setHeader('Cache-Control', 'public,max-age=60');
    try {
        if (_cache && Date.now() - _cacheFecha < CACHE_TTL)
            return res.json({ ok: true, articulos: _cache, cached: true });
        const r = await pool.query(
            `SELECT id,titulo,slug,resumen,tags,categoria,imagen,imagen_alt,autor,vistas,fecha_publicacion
             FROM articulos WHERE estado='publicado' ORDER BY fecha_publicacion DESC LIMIT 30`
        );
        _cache = r.rows; _cacheFecha = Date.now();
        res.json({ ok: true, articulos: r.rows });
    } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.get('/api/articulos/:categoria', async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT id,titulo,slug,resumen,categoria,imagen,autor,fecha_publicacion
             FROM articulos WHERE estado='publicado' AND categoria=$1 ORDER BY fecha_publicacion DESC LIMIT 12`,
            [decodeURIComponent(req.params.categoria)]
        );
        res.json({ ok: true, articulos: r.rows });
    } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.get('/api/estadisticas', async (req, res) => {
    try {
        const r = await pool.query("SELECT COUNT(*) as c, SUM(vistas) as v FROM articulos WHERE estado='publicado'");
        res.json({ ok: true, total: parseInt(r.rows[0].c), vistas: parseInt(r.rows[0].v) || 0 });
    } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// Panel admin — lista completa
app.get('/api/admin/listado', authMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM articulos ORDER BY fecha_publicacion DESC');
        res.json({ ok: true, articulos: r.rows });
    } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// Generar manual desde panel
app.post('/api/admin/generar', authMiddleware, async (req, res) => {
    const { categoria } = req.body;
    if (!categoria) return res.status(400).json({ ok: false, msg: 'Falta categoría' });
    const r = await generarArticulo(categoria);
    res.status(r.ok ? 200 : 500).json(r);
});

// Procesar RSS manual
app.post('/api/admin/rss', authMiddleware, async (req, res) => {
    procesarRSS();
    res.json({ ok: true, msg: 'RSS iniciado en background' });
});

// Borrar artículo
app.delete('/api/admin/borrar/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM articulos WHERE id=$1', [parseInt(req.params.id)]);
        invalidarCache();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// Status del sistema
app.get('/status', async (req, res) => {
    try {
        const r    = await pool.query("SELECT COUNT(*) FROM articulos WHERE estado='publicado'");
        const ul   = await pool.query("SELECT titulo, fecha_publicacion FROM articulos WHERE estado='publicado' ORDER BY fecha_publicacion DESC LIMIT 1");
        const min  = ul.rows.length ? Math.round((Date.now() - new Date(ul.rows[0].fecha_publicacion)) / 60000) : 9999;
        const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2].filter(Boolean).length;
        res.json({
            status:'OK', version:'2.0', proyecto:'Farol Tech & Negocios',
            articulos: parseInt(r.rows[0].count),
            min_sin_publicar: min,
            ultima_noticia: ul.rows[0]?.titulo?.substring(0,60) || '—',
            gemini_model: GEMINI_MODEL,
            gemini_keys: keys,
            pexels: PEXELS_API_KEY ? '✅ Activa' : '⚠️ Sin key',
            adsense: ADSENSE_PUB,
            cron: '✅ 1 artículo/hora',
            rss: '✅ 7:30am · 1:30pm · 8:30pm',
            rafaga_inicial: '✅ 3 artículos · 20 min entre c/u',
            categorias: CATEGORIAS
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// RUTA ARTÍCULO INDIVIDUAL — SSR con SEO
// ══════════════════════════════════════════════════════════
app.get('/articulo/:slug', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM articulos WHERE slug=$1 AND estado='publicado'", [req.params.slug]);
        if (!r.rows.length) return res.status(404).sendFile(path.join(__dirname, 'client', 'noticia.html'));
        const a = r.rows[0];
        await pool.query('UPDATE articulos SET vistas=vistas+1 WHERE id=$1', [a.id]);
        try {
            let html = fs.readFileSync(path.join(__dirname, 'client', 'noticia.html'), 'utf8');
            const urlA = `${BASE_URL}/articulo/${a.slug}`;
            const fecha = new Date(a.fecha_publicacion).toLocaleDateString('es-DO',
                { year:'numeric', month:'long', day:'numeric' });
            html = html
                .replace('<!-- META_TAGS -->', metaTags(a, urlA))
                .replace(/\{\{TITULO\}\}/g,    esc(a.titulo))
                .replace(/\{\{CONTENIDO\}\}/g, a.contenido_html || '')
                .replace(/\{\{RESUMEN\}\}/g,   esc(a.resumen || ''))
                .replace(/\{\{FECHA\}\}/g,     fecha)
                .replace(/\{\{IMAGEN\}\}/g,    a.imagen || imagenLocal(a.categoria))
                .replace(/\{\{ALT\}\}/g,       esc(a.imagen_alt || a.titulo))
                .replace(/\{\{AUTOR\}\}/g,     esc(a.autor || 'Redacción FT'))
                .replace(/\{\{CATEGORIA\}\}/g, esc(a.categoria))
                .replace(/\{\{VISTAS\}\}/g,    a.vistas || 0)
                .replace(/\{\{TAGS\}\}/g,      esc(a.tags || ''))
                .replace(/\{\{SLUG\}\}/g,      esc(a.slug))
                .replace(/\{\{URL\}\}/g,       encodeURIComponent(urlA))
                .replace(/\{\{ADSENSE_PUB\}\}/g, ADSENSE_PUB);
            res.setHeader('Content-Type', 'text/html;charset=utf-8');
            res.setHeader('Cache-Control', 'public,max-age=300');
            res.send(html);
        } catch(e) { res.json(a); }
    } catch (e) { res.status(500).send('Error'); }
});

// ══════════════════════════════════════════════════════════
// SEO: Sitemap + Robots + Ads.txt
// ══════════════════════════════════════════════════════════
app.get('/sitemap.xml', async (req, res) => {
    try {
        const r   = await pool.query("SELECT slug,fecha_publicacion FROM articulos WHERE estado='publicado' ORDER BY fecha_publicacion DESC");
        const now = Date.now();
        let xml   = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">\n';
        xml += `<url><loc>${BASE_URL}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n`;
        r.rows.forEach(a => {
            const d = (now - new Date(a.fecha_publicacion).getTime()) / 86400000;
            xml += `<url><loc>${BASE_URL}/articulo/${a.slug}</loc>`
                + `<lastmod>${new Date(a.fecha_publicacion).toISOString().split('T')[0]}</lastmod>`
                + `<changefreq>${d<1?'hourly':d<7?'daily':'weekly'}</changefreq>`
                + `<priority>${d<1?'1.0':d<7?'0.9':d<30?'0.7':'0.5'}</priority></url>\n`;
        });
        xml += '</urlset>';
        res.header('Content-Type','application/xml').header('Cache-Control','public,max-age=3600').send(xml);
    } catch(e) { res.status(500).send('Error'); }
});

app.get('/robots.txt', (req, res) => {
    res.header('Content-Type','text/plain').send(
        `User-agent: *\nAllow: /\nDisallow: /redaccion\nDisallow: /api/admin\n\nUser-agent: Googlebot\nAllow: /\nCrawl-delay: 1\n\nSitemap: ${BASE_URL}/sitemap.xml`
    );
});

app.get('/ads.txt', (req, res) => {
    res.header('Content-Type','text/plain').send(`google.com, ${ADSENSE_PUB}, DIRECT, f08c47fec0942fa0\n`);
});

// ══════════════════════════════════════════════════════════
// PÁGINAS
// ══════════════════════════════════════════════════════════
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));
app.get('/redaccion',   authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'client', 'redaccion.html')));
app.get('/redaccion.html', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'client', 'redaccion.html')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

// ══════════════════════════════════════════════════════════
// ARRANQUE
// ══════════════════════════════════════════════════════════
async function iniciar() {
    await inicializarDB();
    app.listen(PORT, '0.0.0.0', () => {
        const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2].filter(Boolean).length;
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🐂 FAROL TECH & NEGOCIOS — V2.0                            ║
╠══════════════════════════════════════════════════════════════╣
║  🌐 Web:       ${BASE_URL.padEnd(40)}║
║  🤖 IA:        ${GEMINI_MODEL.padEnd(40)}║
║  🔑 Keys:      ${String(keys + ' llave(s) Gemini configurada(s)').padEnd(40)}║
║  📸 Pexels:    ${(PEXELS_API_KEY ? '✅ Activa' : '⚠️  Sin key (usando banco local)').padEnd(40)}║
║  💰 AdSense:   ${ADSENSE_PUB.padEnd(40)}║
║  ⏰ Cron:      1 artículo/hora · RSS 7:30 · 13:30 · 20:30   ║
║  🚀 Ráfaga:    3 artículos · 20 min entre c/u               ║
╚══════════════════════════════════════════════════════════════╝`);
    });
    setTimeout(rafagaInicial, 12000);
}

iniciar();
module.exports = app;
