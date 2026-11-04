import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: 'C:\\sviluppo\\magazzino-web-app\\.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const aliasMap = {
  'VERT LAVATRICE BEBÈ **': 'VERT DETERGENTE LAVATRICE BEBE RICARICA **',
  'VERT IGIENIZZANTE BEBÈ': 'VERT IGIENIZZANTE BEBÉ **',
  'VERT IGIENIZZANTE BEBè': 'VERT IGIENIZZANTE BEBÉ **',
  'TOVAGLIOLI CUCINA 40X40': 'TOVAGLIOLI 40X40 RISPARMIO CASA **',
  'TOVAGLIOLI 33X33': 'TOVAGLIOLI RISPARMIO CASA 33X33',
  'CHANTECLAIR': 'CHANTECLAIR E RICARICHE',
  'SPRAY AMBIENTE': 'FRESH AROMA DEODORANTE AMBIENTE',
  'DIXAN LAVATRICE 2,3': 'DIXAN CLASSICO 2 LT',
  'NAPISAN LAVATRICE 2,2': 'NAPISAN ADDITIVO LAVATRICE 2,2 LT.',
  'SACCHI NERI GRANDI': 'SACCHI NERI CONDOMINIO 80X120 (OPERAI-AVV.-GIARD.)',
  'TRAVERSINE': 'TRAVERSINE IN CONFEZIONE',
  'IKEA LEVA PELI': 'IKEA SPAZZOLE LEVA PELI BASTIS KIT',
  'SACCHI NERI 70X110': 'SACCHI NERI 70X110 (COND.) X10',
  'FAIRY ORIGINAL 90 CAPS': 'FAIRY CAPS LAVASTOVIGLIE GRANDI',
  'FAIRY LAVASTOVIGLIE PLATINUM 28': 'FAIRY CAPS LAVASTOVIGLIE PICCOLE',
};

function parseCSV() {
  const content = fs.readFileSync('C:\\sviluppo\\magazzino-web-app\\raw_import.csv', 'utf-8');
  const lines = content.split('\n');

  let currentSection = 'GIACENZA';
  const giacenze = [];
  const scarichi = [];
  const carichi = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes('###SCARICHI###') || trimmed.includes('PRODOTTI SCARICO,PEZZI SCARICATI')) {
      currentSection = 'SCARICO';
      continue;
    }
    if (trimmed.includes('###CARICHI###') || trimmed.includes('PRODOTTI - CARICO MERCI,QUANTIT')) {
      currentSection = 'CARICO';
      continue;
    }

    if (trimmed.startsWith('Colonna 1') || trimmed.startsWith('PRODOTTI,')) continue;

    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else current += char;
    }
    parts.push(current.trim());

    if (currentSection === 'GIACENZA') {
      const rawName = parts[1] ? parts[1].replace(/^"|"$/g, '').trim() : '';
      if (rawName) {
        const stock = parseInt(parts[2]) || 0;
        const price = parseFloat((parts[4] || '0').replace(',', '.')) || 0;
        giacenze.push({ name: rawName, stock, unit_price: price });
      }
    } else if (currentSection === 'SCARICO') {
      const rawName = parts[1] ? parts[1].replace(/^"|"$/g, '').trim() : '';
      const qty = parseInt(parts[2]) || 0;
      const dest = parts[4] ? parts[4].replace(/^"|"$/g, '').trim() : '';
      const date = parts[5] ? parts[5].trim() : '';
      if (rawName && qty) {
        scarichi.push({ name: rawName, quantity: qty, destination: dest, date });
      }
    } else if (currentSection === 'CARICO') {
      const rawName = parts[1] ? parts[1].replace(/^"|"$/g, '').trim() : '';
      const qty = parseInt(parts[2]) || 0;
      const supplier = parts[3] ? parts[3].replace(/^"|"$/g, '').trim() : '';
      const date = parts[4] ? parts[4].trim() : '';
      if (rawName && qty) {
        carichi.push({ name: rawName, quantity: qty, supplier, date });
      }
    }
  }

  return { giacenze, scarichi, carichi };
}

async function runImport() {
  console.log('🚀 Avvio procedura di importazione totale...');
  const { giacenze, scarichi, carichi } = parseCSV();

  console.log(`Dati letti: ${giacenze.length} prodotti, ${carichi.length} carichi, ${scarichi.length} scarichi`);

  // Fornitori e date
  const supplierMap = new Map();
  const lastChargeDateMap = new Map();
  for (const c of carichi) {
    const canonical = aliasMap[c.name] || c.name;
    const key = canonical.toUpperCase().trim();
    if (c.supplier && c.supplier !== 'GIACENZA') {
      supplierMap.set(key, c.supplier);
    }
    if (c.date) {
      lastChargeDateMap.set(key, c.date);
    }
  }

  // 1. Pulizia tabella movements
  console.log('🧹 Pulizia tabella movements...');
  const { error: delMovErr } = await supabase.from('movements').delete().gte('id', 0);
  if (delMovErr) {
    console.error('Errore pulizia movements:', delMovErr);
  } else {
    console.log('✅ Tabella movements svuotata.');
  }

  // 2. Pulizia tabella products
  console.log('🧹 Pulizia tabella products...');
  const { error: delProdErr } = await supabase.from('products').delete().gte('id', 0);
  if (delProdErr) {
    console.error('Errore pulizia products:', delProdErr);
  } else {
    console.log('✅ Tabella products svuotata.');
  }

  // 3. Prepara anagrafica prodotti unici
  const productsToInsert = [];
  const seenProducts = new Set();

  for (const g of giacenze) {
    const key = g.name.toUpperCase().trim();
    if (seenProducts.has(key)) {
      continue;
    }
    seenProducts.add(key);

    productsToInsert.push({
      name: g.name.trim(),
      stock: g.stock,
      unit_price: g.unit_price,
      supplier: supplierMap.get(key) || null,
      last_charge_date: lastChargeDateMap.get(key) || null,
    });
  }

  console.log(`📦 Inserimento di ${productsToInsert.length} prodotti unici in anagrafica...`);
  for (let i = 0; i < productsToInsert.length; i += 50) {
    const chunk = productsToInsert.slice(i, i + 50);
    const { error } = await supabase.from('products').insert(chunk);
    if (error) {
      console.error('Errore inserimento chunk prodotti:', error);
      process.exit(1);
    }
  }

  // 4. Recupera tutti i prodotti inseriti con i loro ID
  const { data: allProds, error: fetchErr } = await supabase.from('products').select('*');
  if (fetchErr || !allProds) {
    console.error('Errore recupero prodotti:', fetchErr);
    process.exit(1);
  }

  console.log(`✅ ${allProds.length} prodotti inseriti con successo in products!`);

  const prodByName = new Map();
  for (const p of allProds) {
    prodByName.set(p.name.toUpperCase().trim(), p);
  }

  function getProduct(rawName) {
    const canonical = aliasMap[rawName] || rawName;
    return prodByName.get(canonical.toUpperCase().trim());
  }

  // 5. Inserimento Carichi
  console.log(`📥 Preparazione e inserimento ${carichi.length} movimenti di CARICO...`);
  const carichiMovements = [];
  for (const c of carichi) {
    const p = getProduct(c.name);
    if (!p) {
      console.warn(`⚠️ Prodotto non trovato per carico: "${c.name}"`);
      continue;
    }
    carichiMovements.push({
      product_id: p.id,
      type: 'CARICO',
      quantity: c.quantity,
      movement_date: c.date || new Date().toISOString().split('T')[0],
      supplier: c.supplier || null,
    });
  }

  for (let i = 0; i < carichiMovements.length; i += 100) {
    const chunk = carichiMovements.slice(i, i + 100);
    const { error } = await supabase.from('movements').insert(chunk);
    if (error) {
      console.error('Errore inserimento chunk carichi:', error);
      process.exit(1);
    }
  }
  console.log(`✅ Inseriti ${carichiMovements.length} movimenti di CARICO.`);

  // 6. Inserimento Scarichi
  console.log(`📤 Preparazione e inserimento ${scarichi.length} movimenti di SCARICO...`);
  const scarichiMovements = [];
  for (const s of scarichi) {
    const p = getProduct(s.name);
    if (!p) {
      console.warn(`⚠️ Prodotto non trovato per scarico: "${s.name}"`);
      continue;
    }
    scarichiMovements.push({
      product_id: p.id,
      type: 'SCARICO',
      quantity: s.quantity,
      movement_date: s.date || new Date().toISOString().split('T')[0],
      destination: s.destination || null,
      requester: null,
    });
  }

  for (let i = 0; i < scarichiMovements.length; i += 100) {
    const chunk = scarichiMovements.slice(i, i + 100);
    const { error } = await supabase.from('movements').insert(chunk);
    if (error) {
      console.error('Errore inserimento chunk scarichi:', error);
      process.exit(1);
    }
  }
  console.log(`✅ Inseriti ${scarichiMovements.length} movimenti di SCARICO.`);

  console.log('\n🎉 IMPORTAZIONE COMPLETATA CON SUCCESSO AL 100%!');
}

runImport();
