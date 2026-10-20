import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.toLowerCase() || '';

  if (!query) {
    return NextResponse.json({ error: 'Query mancante' }, { status: 400 });
  }

  try {
    // Simulazione intelligente del prezzo medio basata sulle parole chiave del prodotto
    let simulatedPrice = 3.50; // Prezzo medio di fallback

    if (query.includes('amuchina')) {
      simulatedPrice = 4.80;
    } else if (query.includes('alcool')) {
      simulatedPrice = 2.20;
    } else if (query.includes('acqua distillata')) {
      simulatedPrice = 1.90;
    } else if (query.includes('acchiappa colore')) {
      simulatedPrice = 3.90;
    } else if (query.includes('stira bene') || query.includes('amulsio')) {
      simulatedPrice = 3.40;
    } else if (query.includes('argentil')) {
      simulatedPrice = 5.50;
    } else if (query.includes('aria sana') || query.includes('deodorante')) {
      simulatedPrice = 4.20;
    }

    return NextResponse.json({ price: simulatedPrice });
  } catch (error) {
    console.error('Errore durante la simulazione del prezzo:', error);
    return NextResponse.json({ error: 'Errore interno durante la ricerca' }, { status: 500 });
  }
}