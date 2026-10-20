import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Errore: Credenziali Supabase mancanti in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importData() {
  console.log("📂 Lettura del file Excel in corso...\n");
  const workbook = XLSX.readFile('C:\\Users\\mtmic\\Desktop\\magazzino-web-app\\dati.xlsx');
  const sheetName = 'Magazzino';
  const worksheet = workbook.Sheets[sheetName];
  
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const productsToUpsert = [];
  let consecutiveEmptyRows = 0;

  // Partiamo dalla riga 4 dell'Excel (indice array 3)
  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    const rawName = row ? row[1] : undefined;
    const productName = rawName ? String(rawName).trim() : '';

    if (!productName) {
      consecutiveEmptyRows++;
      if (consecutiveEmptyRows >= 10) {
        break;
      }
      continue;
    }

    consecutiveEmptyRows = 0;

    const stockVal = Number(row[2]);
    const priceVal = Number(row[4]);

    productsToUpsert.push({
      name: productName,
      stock: !isNaN(stockVal) ? stockVal : 0,
      unit_price: !isNaN(priceVal) ? priceVal : 0.00
    });
  }

  console.log(`📊 Prodotti validi estratti dal file: ${productsToUpsert.length}`);
  console.log(`🧹 Svuotamento della tabella prodotti su Supabase...`);
  
  const { error: deleteError } = await supabase
    .from('products')
    .delete()
    .neq('id', 0);

  if (deleteError) {
    console.error("❌ Errore durante la pulizia della tabella:", deleteError.message);
    process.exit(1);
  }

  console.log(`✅ Tabella svuotata. Sincronizzazione tramite upsert in corso...`);

  // Usiamo upsert a blocchi di 50 per gestire eventuali nomi duplicati senza bloccare l'importazione
  const chunkSize = 50;
  for (let i = 0; i < productsToUpsert.length; i += chunkSize) {
    const chunk = productsToUpsert.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('products')
      .upsert(chunk, { onConflict: 'name' });

    if (error) {
      console.error(`❌ Errore nel blocco ${i}:`, error.message);
    } else {
      console.log(`📦 Sincronizzati prodotti da ${i + 1} a ${Math.min(i + chunkSize, productsToUpsert.length)}`);
    }
  }

  console.log(`\n✅ Sincronizzazione completata con successo!`);
}

importData();