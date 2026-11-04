'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Product, Movement } from '@/types';

function formatDateToItalian(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function formatEuro(amount: number | null | undefined): string {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtri e navigazione
  const [activeTab, setActiveTab] = useState<'giacenza' | 'carico' | 'scarico'>('giacenza');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'critical' | 'available' | 'zero'>('all');

  // Notifiche Toast
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modale Carico / Scarico
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'CARICO' | 'SCARICO'>('CARICO');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [movementDate, setMovementDate] = useState('');
  const [requester, setRequester] = useState('');
  const [destination, setDestination] = useState('');
  const [supplier, setSupplier] = useState('');

  // Modale Nuovo Prodotto
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductStock, setNewProductStock] = useState<number>(0);
  const [newProductPrice, setNewProductPrice] = useState<number>(0);
  const [newProductSupplier, setNewProductSupplier] = useState('');

  // Modale Prezzo Web
  const [webPriceProduct, setWebPriceProduct] = useState<Product | null>(null);
  const [inputWebPrice, setInputWebPrice] = useState<string>('');

  // Modale Modifica Prodotto
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editStock, setEditStock] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editSupplier, setEditSupplier] = useState<string>('');

  // Modale Conferma Eliminazione
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Stato salvataggio in corso
  const [isSaving, setIsSaving] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    setMovementDate(new Date().toISOString().split('T')[0]);
    fetchData();
  }, []);

  // Gestione chiusura modali con tasto ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsNewProductModalOpen(false);
        setWebPriceProduct(null);
        setEditingProduct(null);
        setProductToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const { data: prodData, error: prodErr } = await supabase.from('products').select('*').order('name');
      const { data: movData, error: movErr } = await supabase.from('movements').select('*').order('created_at', { ascending: false });

      if (prodErr) throw prodErr;
      if (movErr) throw movErr;

      if (prodData) setProducts(prodData);
      if (movData) setMovements(movData);
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Errore caricamento dati', err.message || 'Impossibile connettersi al database Supabase');
    } finally {
      setIsLoading(false);
    }
  }

  const handleWebPriceSearch = (product: Product) => {
    const cleanedName = product.name.replace(/\(.*?\)/g, '').trim();
    const searchQuery = encodeURIComponent(`prezzo ${cleanedName}`);
    window.open(`https://www.google.com/search?tbm=shop&q=${searchQuery}`, '_blank', 'noopener,noreferrer');

    setWebPriceProduct(product);
    setInputWebPrice(product.unit_price ? product.unit_price.toString() : '');
  };

  const handleSaveWebPrice = async () => {
    if (!webPriceProduct) return;
    const newPrice = parseFloat(inputWebPrice.replace(',', '.'));

    if (isNaN(newPrice) || newPrice < 0) {
      addToast('error', 'Prezzo non valido', 'Inserisci un valore numerico valido (es. 4.50)');
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from('products')
      .update({ unit_price: newPrice })
      .eq('id', webPriceProduct.id);
    setIsSaving(false);

    if (error) {
      addToast('error', 'Errore aggiornamento prezzo', error.message);
    } else {
      addToast('success', 'Prezzo aggiornato', `${webPriceProduct.name}: nuovo prezzo ${formatEuro(newPrice)}`);
      setWebPriceProduct(null);
      setInputWebPrice('');
      fetchData();
    }
  };

  const handleSaveEditProduct = async () => {
    if (!editingProduct) return;

    setIsSaving(true);
    const { error } = await supabase
      .from('products')
      .update({ stock: editStock, unit_price: editPrice, supplier: editSupplier })
      .eq('id', editingProduct.id);
    setIsSaving(false);

    if (error) {
      addToast('error', 'Errore durante la modifica', error.message);
    } else {
      addToast('success', 'Prodotto aggiornato', `Dati di "${editingProduct.name}" salvati con successo.`);
      setEditingProduct(null);
      fetchData();
    }
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;

    setIsSaving(true);
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productToDelete.id);
    setIsSaving(false);

    if (error) {
      addToast('error', 'Errore durante l\'eliminazione', error.message);
    } else {
      addToast('success', 'Prodotto eliminato', `"${productToDelete.name}" è stato rimosso dall'anagrafica.`);
      setProductToDelete(null);
      setEditingProduct(null);
      fetchData();
    }
  };

  const handleSaveNewProduct = async () => {
    if (!newProductName.trim()) {
      addToast('error', 'Dati incompleti', 'Inserisci il nome del nuovo prodotto');
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from('products').insert([
      {
        name: newProductName.trim(),
        stock: newProductStock,
        unit_price: newProductPrice,
        supplier: newProductSupplier.trim(),
      },
    ]);
    setIsSaving(false);

    if (error) {
      addToast('error', 'Errore creazione prodotto', error.message);
    } else {
      addToast('success', 'Nuovo prodotto aggiunto', `"${newProductName.trim()}" inserito con successo.`);
      setIsNewProductModalOpen(false);
      setNewProductName('');
      setNewProductStock(0);
      setNewProductPrice(0);
      setNewProductSupplier('');
      fetchData();
    }
  };

  const handleSaveMovement = async () => {
    if (!selectedProductId) {
      addToast('error', 'Selezione mancante', 'Seleziona un prodotto dalla lista');
      return;
    }

    if (quantity <= 0) {
      addToast('error', 'Quantità non valida', 'La quantità deve essere maggiore di zero');
      return;
    }

    const targetProduct = products.find((p) => p.id === selectedProductId);
    if (!targetProduct) return;

    if (modalType === 'SCARICO' && targetProduct.stock < quantity) {
      addToast(
        'error',
        'Giacenza insufficiente',
        `Disponibili: ${targetProduct.stock} unità. Impossibile scaricare ${quantity} unità.`
      );
      return;
    }

    const newStock = modalType === 'CARICO'
      ? targetProduct.stock + quantity
      : targetProduct.stock - quantity;

    setIsSaving(true);
    const { error: movError } = await supabase.from('movements').insert([
      {
        product_id: selectedProductId,
        type: modalType,
        quantity: quantity,
        movement_date: movementDate,
        requester: modalType === 'SCARICO' ? requester.trim() : null,
        destination: modalType === 'SCARICO' ? destination.trim() : null,
        supplier: modalType === 'CARICO' ? supplier.trim() : null,
        unit_price: targetProduct.unit_price || 0,
      },
    ]);

    if (movError) {
      setIsSaving(false);
      addToast('error', 'Errore salvataggio movimento', movError.message);
      return;
    }

    const updateData: Partial<Product> = { stock: newStock };
    if (modalType === 'CARICO') {
      updateData.last_charge_date = movementDate;
      if (supplier.trim()) {
        updateData.supplier = supplier.trim();
      }
    }

    const { error: prodError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', selectedProductId);
    setIsSaving(false);

    if (prodError) {
      addToast('error', 'Errore aggiornamento giacenza', prodError.message);
      return;
    }

    addToast(
      'success',
      `Movimento registrato: ${modalType === 'CARICO' ? 'Carico' : 'Scarico'}`,
      `${targetProduct.name} — Quantità: ${modalType === 'CARICO' ? '+' : '-'}${quantity} (Nuova giacenza: ${newStock})`
    );

    setIsModalOpen(false);
    setSelectedProductId('');
    setQuantity(1);
    setRequester('');
    setDestination('');
    setSupplier('');
    fetchData();
  };

  // Statistiche e calcoli memoizzati
  const totalValue = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.stock || 0) * (p.unit_price || 0), 0);
  }, [products]);

  const zeroStockCount = useMemo(() => {
    return products.filter((p) => p.stock === 0).length;
  }, [products]);

  const criticalStockCount = useMemo(() => {
    return products.filter((p) => p.stock > 0 && p.stock <= 2).length;
  }, [products]);

  const availableStockCount = useMemo(() => {
    return products.filter((p) => p.stock > 2).length;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.supplier && p.supplier.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;

      if (stockFilter === 'critical') return p.stock > 0 && p.stock <= 2;
      if (stockFilter === 'zero') return p.stock === 0;
      if (stockFilter === 'available') return p.stock > 2;
      return true;
    });
  }, [products, search, stockFilter]);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 antialiased pb-20">
      {/* Toast Notifications Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-3 ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-950'
                : toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-950'
                : 'bg-blue-50/95 border-blue-200 text-blue-950'
            }`}
          >
            <div className="mt-0.5 text-lg">
              {toast.type === 'success' && (
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {toast.type === 'error' && (
                <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {toast.type === 'info' && (
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold">{toast.title}</h4>
              {toast.message && <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Header Principale */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">Magazzino Master Veggis</h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online
                </span>
              </div>
              <p className="text-xs text-slate-500">Gestione scorte, carichi e scarichi prodotti</p>
            </div>
          </div>

          {/* Pulsanti Azione Rapida in Header */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => { setModalType('CARICO'); setIsModalOpen(true); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border border-emerald-200/80 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Carico Merce
            </button>
            <button
              onClick={() => { setModalType('SCARICO'); setIsModalOpen(true); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100/80 border border-rose-200/80 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
              Scarico Merce
            </button>
            <button
              onClick={() => setIsNewProductModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all cursor-pointer shadow-sm shadow-blue-500/20 active:scale-98"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nuovo Prodotto
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-6">
        {/* KPI Cards / Metriche in evidenza */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Articoli a Catalogo</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{products.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Valore Magazzino</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{formatEuro(totalValue)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <button
            onClick={() => { setActiveTab('giacenza'); setStockFilter(stockFilter === 'critical' ? 'all' : 'critical'); }}
            className={`p-5 rounded-xl border text-left transition-all cursor-pointer shadow-xs flex items-center justify-between ${
              stockFilter === 'critical'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/40'
                : 'bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/30'
            }`}
          >
            <div>
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Scorte Critiche (≤ 2)</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{criticalStockCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => { setActiveTab('giacenza'); setStockFilter(stockFilter === 'zero' ? 'all' : 'zero'); }}
            className={`p-5 rounded-xl border text-left transition-all cursor-pointer shadow-xs flex items-center justify-between ${
              stockFilter === 'zero'
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/40'
                : 'bg-white border-slate-200 hover:border-rose-200 hover:bg-rose-50/30'
            }`}
          >
            <div>
              <p className="text-xs font-medium text-rose-700 uppercase tracking-wider">Articoli Esauriti (0)</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{zeroStockCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </button>
        </div>

        {/* Tab Bar di Navigazione */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs mb-6 p-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('giacenza')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'giacenza'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M15 4v16M4 12h16" />
              </svg>
              Giacenza Magazzino
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                activeTab === 'giacenza' ? 'bg-blue-700 text-white' : 'bg-slate-200/80 text-slate-700'
              }`}>
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('carico')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'carico'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
              Registro Carichi
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                activeTab === 'carico' ? 'bg-emerald-700 text-white' : 'bg-slate-200/80 text-slate-700'
              }`}>
                {movements.filter((m) => m.type === 'CARICO').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('scarico')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'scarico'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              Registro Scarichi
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                activeTab === 'scarico' ? 'bg-rose-700 text-white' : 'bg-slate-200/80 text-slate-700'
              }`}>
                {movements.filter((m) => m.type === 'SCARICO').length}
              </span>
            </button>
          </div>

          <div className="pr-2">
            <button
              onClick={fetchData}
              disabled={isLoading}
              title="Ricarica dati da Supabase"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Aggiorna
            </button>
          </div>
        </div>

        {/* ===================== TAB 1: GIACENZA MAGAZZINO ===================== */}
        {activeTab === 'giacenza' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Barra Filtri e Ricerca */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
              {/* Barra di ricerca con icona */}
              <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Cerca per nome prodotto o fornitore..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 bg-white text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Filtri rapidi giacenza */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-400 mr-1">Filtra per stato:</span>
                <button
                  onClick={() => setStockFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    stockFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tutti ({products.length})
                </button>
                <button
                  onClick={() => setStockFilter('available')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    stockFilter === 'available'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50/50'
                  }`}
                >
                  Disponibili ({availableStockCount})
                </button>
                <button
                  onClick={() => setStockFilter('critical')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    stockFilter === 'critical'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50/50'
                  }`}
                >
                  Scorta Minima ({criticalStockCount})
                </button>
                <button
                  onClick={() => setStockFilter('zero')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    stockFilter === 'zero'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50/50'
                  }`}
                >
                  Esauriti ({zeroStockCount})
                </button>
              </div>
            </div>

            {/* Tabella Giacenza */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-5">Prodotto</th>
                    <th className="py-3.5 px-4 text-center">Stato & Giacenza</th>
                    <th className="py-3.5 px-4 text-right">Prezzo Unitario</th>
                    <th className="py-3.5 px-4 text-right">Valore Totale</th>
                    <th className="py-3.5 px-4">Fornitore</th>
                    <th className="py-3.5 px-4 text-center">Ultimo Carico</th>
                    <th className="py-3.5 px-5 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="inline-flex items-center gap-2">
                          <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Caricamento articoli in corso...
                        </div>
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <div className="max-w-xs mx-auto flex flex-col items-center">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                          </div>
                          <p className="font-semibold text-slate-700 text-sm">Nessun articolo trovato</p>
                          <p className="text-xs text-slate-400 mt-1">Nessun prodotto corrisponde ai criteri di ricerca o ai filtri applicati.</p>
                          {(search || stockFilter !== 'all') && (
                            <button
                              onClick={() => { setSearch(''); setStockFilter('all'); }}
                              className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
                            >
                              Reimposta tutti i filtri
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const isZero = p.stock === 0;
                      const isLow = p.stock > 0 && p.stock <= 2;
                      const rowTotal = (p.stock || 0) * (p.unit_price || 0);

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isZero ? 'bg-rose-50/25' : isLow ? 'bg-amber-50/20' : ''
                          }`}
                        >
                          <td className="py-3 px-5 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{p.name}</span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            {isZero ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Esaurito (0)
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                Scorta Minima ({p.stock})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
                                {p.stock} pz
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right font-medium text-slate-700">
                            {formatEuro(p.unit_price)}
                          </td>

                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            {formatEuro(rowTotal)}
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            {p.supplier ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium text-slate-600">
                                {p.supplier}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center text-slate-500 text-[11px]">
                            {formatDateToItalian(p.last_charge_date)}
                          </td>

                          <td className="py-3 px-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleWebPriceSearch(p)}
                                title="Cerca e aggiorna prezzo sul web"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/60 transition-colors cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9-9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                                Prezzo Web
                              </button>
                              <button
                                onClick={() => {
                                  setEditingProduct(p);
                                  setEditStock(p.stock);
                                  setEditPrice(p.unit_price || 0);
                                  setEditSupplier(p.supplier || '');
                                }}
                                title="Modifica articolo"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Modifica
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer con conteggio */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
              <span>Visualizzati: <strong>{filteredProducts.length}</strong> su <strong>{products.length}</strong> articoli</span>
              <span>Totale valore visualizzato: <strong className="text-slate-900">{formatEuro(filteredProducts.reduce((acc, p) => acc + (p.stock || 0) * (p.unit_price || 0), 0))}</strong></span>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: REGISTRO CARICHI ===================== */}
        {activeTab === 'carico' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-emerald-50/40 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Storico Movimenti di Carico</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tutte le entrate merce registrate a magazzino</p>
              </div>
              <button
                onClick={() => { setModalType('CARICO'); setIsModalOpen(true); }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Registra Nuovo Carico
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-5">Data Arrivo</th>
                    <th className="py-3 px-5">Prodotto</th>
                    <th className="py-3 px-4 text-center">Quantità Ricevuta</th>
                    <th className="py-3 px-4 text-right">Prezzo Unitario</th>
                    <th className="py-3 px-4 text-right">Totale Entrata</th>
                    <th className="py-3 px-5">Fornitore</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {movements.filter((m) => m.type === 'CARICO').length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        Nessun carico merce registrato nello storico.
                      </td>
                    </tr>
                  ) : (
                    movements.filter((m) => m.type === 'CARICO').map((m) => {
                      const prod = products.find((p) => p.id === m.product_id);
                      const unitP = m.unit_price || 0;
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-5 font-medium text-slate-600">
                            {formatDateToItalian(m.movement_date)}
                          </td>
                          <td className="py-3 px-5 font-semibold text-slate-900">
                            {prod?.name || 'Prodotto eliminato o non trovato'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              +{m.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-700">
                            {formatEuro(unitP)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            {formatEuro(m.quantity * unitP)}
                          </td>
                          <td className="py-3 px-5 text-slate-600">
                            {m.supplier || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================== TAB 3: REGISTRO SCARICHI ===================== */}
        {activeTab === 'scarico' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-rose-50/40 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Storico Movimenti di Scarico</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tutte le uscite merce e prelievi per reparto</p>
              </div>
              <button
                onClick={() => { setModalType('SCARICO'); setIsModalOpen(true); }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-all cursor-pointer shadow-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
                Registra Nuovo Scarico
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-5">Data Prelievo</th>
                    <th className="py-3 px-5">Prodotto</th>
                    <th className="py-3 px-4 text-center">Quantità Scaricata</th>
                    <th className="py-3 px-5">Richiedente</th>
                    <th className="py-3 px-5">Destinazione / Reparto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {movements.filter((m) => m.type === 'SCARICO').length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        Nessuno scarico registrato nello storico.
                      </td>
                    </tr>
                  ) : (
                    movements.filter((m) => m.type === 'SCARICO').map((m) => {
                      const prod = products.find((p) => p.id === m.product_id);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-5 font-medium text-slate-600">
                            {formatDateToItalian(m.movement_date)}
                          </td>
                          <td className="py-3 px-5 font-semibold text-slate-900">
                            {prod?.name || 'Prodotto eliminato o non trovato'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              -{m.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-5 font-medium text-slate-700">
                            {m.requester || '-'}
                          </td>
                          <td className="py-3 px-5 text-slate-600">
                            {m.destination ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium text-slate-700">
                                {m.destination}
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ===================== MODALE: PREZZO WEB ===================== */}
      {webPriceProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9-9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">Aggiorna Prezzo Web</h3>
              </div>
              <button
                onClick={() => setWebPriceProduct(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Hai consultato il prezzo sul web. Inserisci il prezzo medio unitario rilevato per:
              <strong className="block text-slate-900 mt-1 font-semibold">{webPriceProduct.name}</strong>
            </p>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nuovo Prezzo Unitario (€):</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm">€</span>
                <input
                  type="text"
                  autoFocus
                  placeholder="es. 3.50"
                  value={inputWebPrice}
                  onChange={(e) => setInputWebPrice(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveWebPrice(); }}
                  className="w-full pl-8 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setWebPriceProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveWebPrice}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                {isSaving ? 'Salvataggio...' : 'Salva Prezzo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE: MODIFICA PRODOTTO ===================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">Modifica Prodotto</h3>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs font-semibold text-blue-700 bg-blue-50/70 p-2.5 rounded-lg border border-blue-100 mb-4">
              {editingProduct.name}
            </p>

            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giacenza Attuale (Quantità):</label>
                <input
                  type="number"
                  min="0"
                  value={editStock}
                  onChange={(e) => setEditStock(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prezzo Medio Unitario (€):</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fornitore Principale:</label>
                <input
                  type="text"
                  placeholder="Nome fornitore"
                  value={editSupplier}
                  onChange={(e) => setEditSupplier(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProductToDelete(editingProduct)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Elimina
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditProduct}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  {isSaving ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE: CONFERMA ELIMINAZIONE PRODOTTO ===================== */}
      {productToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <h3 className="text-base font-bold text-slate-900">Elimina articolo?</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Sei sicuro di voler rimuovere definitivamente <strong className="text-slate-900">{productToDelete.name}</strong> dall&apos;anagrafica? L&apos;operazione non può essere annullata.
            </p>

            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={confirmDeleteProduct}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                {isSaving ? 'Eliminazione...' : 'Sì, elimina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE: NUOVO PRODOTTO ===================== */}
      {isNewProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">Nuovo Articolo Magazzino</h3>
              </div>
              <button
                onClick={() => setIsNewProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3.5 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Articolo *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Es. CARTA IGIENICA ROTOLONI"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Giacenza Iniziale</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newProductStock}
                    onChange={(e) => setNewProductStock(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prezzo Unitario (€)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fornitore</label>
                <input
                  type="text"
                  placeholder="Nome del fornitore o distributore"
                  value={newProductSupplier}
                  onChange={(e) => setNewProductSupplier(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewProductModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveNewProduct}
                disabled={isSaving}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                {isSaving ? 'Salvataggio...' : 'Crea Prodotto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE: REGISTRA CARICO / SCARICO ===================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  modalType === 'CARICO' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {modalType === 'CARICO' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                    </svg>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {modalType === 'CARICO' ? 'Registra Carico Merce' : 'Registra Scarico Merce'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3.5 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Seleziona Articolo *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">-- Seleziona un articolo dall&apos;elenco --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Disponibili: {p.stock} pz)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantità *</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Movimento</label>
                  <input
                    type="date"
                    value={movementDate}
                    onChange={(e) => setMovementDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {modalType === 'CARICO' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fornitore</label>
                  <input
                    type="text"
                    placeholder="Nome del fornitore da cui è arrivata la merce"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              )}

              {modalType === 'SCARICO' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Richiedente / Operatore</label>
                    <input
                      type="text"
                      placeholder="Nome della persona che richiede o ritira"
                      value={requester}
                      onChange={(e) => setRequester(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Destinazione / Reparto</label>
                    <input
                      type="text"
                      placeholder="Es. Uffici Amministrazione, Piano 1, Sala Riunioni"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveMovement}
                disabled={isSaving}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg transition-colors cursor-pointer shadow-xs ${
                  modalType === 'CARICO'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isSaving ? 'Registrazione...' : modalType === 'CARICO' ? 'Conferma Carico' : 'Conferma Scarico'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
