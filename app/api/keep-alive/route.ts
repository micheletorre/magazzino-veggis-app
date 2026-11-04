import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { error } = await supabase.from('products').select('id').limit(1);

    if (error) {
      console.error('Keep-alive query error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Supabase pinged successfully',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Keep-alive exception:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
