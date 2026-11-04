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

interface BatchItem {
  tempId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  currentStock: number;
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

  // ================= BATCH CARICO (Ricezione DDT a ciclo continuo) =================
  const [caricoDate, setCaricoDate] = useState('');
  const [caricoSupplier, setCaricoSupplier] = useState('');
  const [caricoReference, setCaricoReference] = useState(''); // es. n. DDT
  const [caricoSelectedProductId, setCaricoSelectedProductId] = useState('');
  const [caricoQuantity, setCaricoQuantity] = useState(1);
  const [caricoUnitPrice, setCaricoUnitPrice] = useState<number>(0);
  const [caricoItems, setCaricoItems] = useState<BatchItem[]>([]);

  // ================= BATCH SCARICO (Uscita Merce a ciclo continuo) =================
  const [scaricoDate, setScaricoDate] = useState('');
  const [scaricoRequester, setScaricoRequester] = useState('');
  const [scaricoDestination, setScaricoDestination] = useState('');
  const [scaricoSelectedProductId, setScaricoSelectedProductId] = useState('');
  const [scaricoQuantity, setScaricoQuantity] = useState(1);
  const [scaricoItems, setScaricoItems] = useState<BatchItem[]>([]);

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

  // Evidenziazione e auto-scroll al prodotto modificato
  const [highlightedProductId, setHighlightedProductId] = useState<string | number | null>(null);

  // Stato salvataggio in corso
  const [isSaving, setIsSaving] = useState(false);

  const scrollToProduct = (productId: string | number) => {
    setHighlightedProductId(productId);
    setTimeout(() => {
      const el = document.getElementById(`product-row-${productId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);
    setTimeout(() => {
      setHighlightedProductId(null);
    }, 3500);
  };

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
    const today = new Date().toISOString().split('T')[0];
    setCaricoDate(today);
    setScaricoDate(today);
    fetchData();
  }, []);

  // Gestione chiusura modali con tasto ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  // Pre-carica prezzo quando si seleziona un prodotto per il Carico
  const handleCaricoProductSelect = (prodId: string) => {
    setCaricoSelectedProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setCaricoUnitPrice(Number(prod.unit_price) || 0);
      if (!caricoSupplier && prod.supplier) {
        setCaricoSupplier(prod.supplier);
      }
    }
  };

  // Aggiunge un riga alla lista provvisoria del DDT Carico
  const handleAddCaricoItem = () => {
    if (!caricoSelectedProductId) {
      addToast('error', 'Seleziona un articolo', 'Scegli un prodotto prima di aggiungerlo al DDT');
      return;
    }
    if (caricoQuantity <= 0) {
      addToast('error', 'Quantità non valida', 'Inserisci una quantità di almeno 1 pezzo');
      return;
    }

    const prod = products.find((p) => p.id === caricoSelectedProductId);
    if (!prod) return;

    // Se il prodotto è già in lista, aggiorniamo la quantità
    const existingIndex = caricoItems.findIndex((item) => item.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...caricoItems];
      updated[existingIndex].quantity += caricoQuantity;
      updated[existingIndex].unitPrice = caricoUnitPrice;
      setCaricoItems(updated);
      addToast('info', 'Quantità aggiornata', `Aggiunti altri ${caricoQuantity} pz a "${prod.name}" (Totale nel DDT: ${updated[existingIndex].quantity} pz)`);
    } else {
      const newItem: BatchItem = {
        tempId: Math.random().toString(36).substring(2, 9),
        productId: prod.id!,
        productName: prod.name,
        quantity: caricoQuantity,
        unitPrice: caricoUnitPrice,
        currentStock: prod.stock || 0,
      };
      setCaricoItems((prev) => [...prev, newItem]);
    }

    // Reset selezione per inserire velocemente il prossimo articolo
    setCaricoSelectedProductId('');
    setCaricoQuantity(1);
    setCaricoUnitPrice(0);
  };

  const handleRemoveCaricoItem = (tempId: string) => {
    setCaricoItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  // Salva l'intero DDT in blocco su Supabase
  const handleConcludeCarico = async () => {
    if (caricoItems.length === 0) {
      addToast('error', 'Nessun prodotto', 'Aggiungi almeno un articolo al DDT prima di concludere');
      return;
    }

    setIsSaving(true);
    try {
      const fullSupplierName = caricoReference.trim()
        ? `${caricoSupplier.trim()} (DDT: ${caricoReference.trim()})`
        : caricoSupplier.trim();

      // 1. Prepara i movimenti da inserire
      const movementsToInsert = caricoItems.map((item) => ({
        product_id: item.productId,
        type: 'CARICO',
        quantity: item.quantity,
        movement_date: caricoDate,
        supplier: fullSupplierName || null,
      }));

      const { error: movError } = await supabase.from('movements').insert(movementsToInsert);
      if (movError) throw movError;

      // 2. Aggiorna giacenza, ultimo carico e fornitore di ogni prodotto
      for (const item of caricoItems) {
        const prod = products.find((p) => p.id === item.productId);
        const currentStock = prod ? prod.stock : item.currentStock;
        const newStock = currentStock + item.quantity;

        const updatePayload: Partial<Product> = {
          stock: newStock,
          last_charge_date: caricoDate,
          unit_price: item.unitPrice > 0 ? item.unitPrice : prod?.unit_price,
        };
        if (caricoSupplier.trim()) {
          updatePayload.supplier = caricoSupplier.trim();
        }

        const { error: prodError } = await supabase
          .from('products')
          .update(updatePayload)
          .eq('id', item.productId);

        if (prodError) {
          console.error(`Errore aggiornamento prodotto ${item.productId}:`, prodError);
        }
      }

      addToast(
        'success',
        'Carico DDT concluso con successo!',
        `Registrati ${caricoItems.length} articoli per un totale di ${caricoItems.reduce((acc, i) => acc + i.quantity, 0)} pezzi.`
      );

      // Reset stato sessione DDT
      setCaricoItems([]);
      setCaricoReference('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Errore durante la registrazione del carico', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ================= SCARICO MERCE (BATCH) =================
  const handleAddScaricoItem = () => {
    if (!scaricoSelectedProductId) {
      addToast('error', 'Seleziona un articolo', 'Scegli un prodotto prima di aggiungerlo alla lista');
      return;
    }
    if (scaricoQuantity <= 0) {
      addToast('error', 'Quantità non valida', 'Inserisci una quantità di almeno 1 pezzo');
      return;
    }

    const prod = products.find((p) => p.id === scaricoSelectedProductId);
    if (!prod) return;

    // Calcola quanto di questo articolo è già in coda di scarico
    const alreadyQueued = scaricoItems
      .filter((i) => i.productId === prod.id)
      .reduce((sum, i) => sum + i.quantity, 0);

    const totalRequested = alreadyQueued + scaricoQuantity;
    if (totalRequested > prod.stock) {
      addToast(
        'error',
        'Giacenza insufficiente',
        `Disponibili a magazzino: ${prod.stock} pz. Stai tentando di scaricare in totale ${totalRequested} pz.`
      );
      return;
    }

    const existingIndex = scaricoItems.findIndex((item) => item.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...scaricoItems];
      updated[existingIndex].quantity += scaricoQuantity;
      setScaricoItems(updated);
      addToast('info', 'Quantità aggiornata', `Totale da scaricare per "${prod.name}": ${updated[existingIndex].quantity} pz`);
    } else {
      const newItem: BatchItem = {
        tempId: Math.random().toString(36).substring(2, 9),
        productId: prod.id!,
        productName: prod.name,
        quantity: scaricoQuantity,
        unitPrice: prod.unit_price || 0,
        currentStock: prod.stock || 0,
      };
      setScaricoItems((prev) => [...prev, newItem]);
    }

    setScaricoSelectedProductId('');
    setScaricoQuantity(1);
  };

  const handleRemoveScaricoItem = (tempId: string) => {
    setScaricoItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleConcludeScarico = async () => {
    if (scaricoItems.length === 0) {
      addToast('error', 'Nessun prodotto', 'Aggiungi almeno un articolo prima di concludere lo scarico');
      return;
    }

    setIsSaving(true);
    try {
      const movementsToInsert = scaricoItems.map((item) => ({
        product_id: item.productId,
        type: 'SCARICO',
        quantity: item.quantity,
        movement_date: scaricoDate,
        requester: scaricoRequester.trim() || null,
        destination: scaricoDestination.trim() || null,
      }));

      const { error: movError } = await supabase.from('movements').insert(movementsToInsert);
      if (movError) throw movError;

      // Aggiorna giacenze
      for (const item of scaricoItems) {
        const prod = products.find((p) => p.id === item.productId);
        const currentStock = prod ? prod.stock : item.currentStock;
        const newStock = Math.max(0, currentStock - item.quantity);

        const { error: prodError } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.productId);

        if (prodError) {
          console.error(`Errore aggiornamento stock prodotto ${item.productId}:`, prodError);
        }
      }

      addToast(
        'success',
        'Scarico merce concluso con successo!',
        `Scaricati ${scaricoItems.length} articoli per un totale di ${scaricoItems.reduce((acc, i) => acc + i.quantity, 0)} pezzi.`
      );

      setScaricoItems([]);
      fetchData();
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Errore durante la registrazione dello scarico', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ================= MODIFICA E PREZZO WEB =================
  const handleWebPriceSearch = (product: Product) => {
    const cleanedName = product.name.replace(/\(.*?\)/g, '').trim();
    const searchQuery = encodeURIComponent(`prezzo ${cleanedName}`);
    window.open(`https://www.google.com/search?tbm=shop&q=${searchQuery}`, '_blank', 'noopener,noreferrer');

    setWebPriceProduct(product);
    setInputWebPrice(product.unit_price ? product.unit_price.toString() : '');
  };

  const handleSaveWebPrice = async () => {
    if (!webPriceProduct) return;
    const targetId = webPriceProduct.id;
    const newPrice = parseFloat(inputWebPrice.replace(',', '.'));

    if (isNaN(newPrice) || newPrice < 0) {
      addToast('error', 'Prezzo non valido', 'Inserisci un valore numerico valido (es. 4.50)');
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from('products')
      .update({ unit_price: newPrice })
      .eq('id', targetId);
    setIsSaving(false);

    if (error) {
      addToast('error', 'Errore aggiornamento prezzo', error.message);
    } else {
      addToast('success', 'Prezzo aggiornato', `${webPriceProduct.name}: nuovo prezzo ${formatEuro(newPrice)}`);
      setWebPriceProduct(null);
      setInputWebPrice('');
      await fetchData();
      if (targetId) {
        scrollToProduct(targetId);
      }
    }
  };

  const handleSaveEditProduct = async () => {
    if (!editingProduct) return;
    const targetId = editingProduct.id;

    setIsSaving(true);
    const { error } = await supabase
      .from('products')
      .update({ stock: editStock, unit_price: editPrice, supplier: editSupplier })
      .eq('id', targetId);
    setIsSaving(false);

    if (error) {
      addToast('error', 'Errore durante la modifica', error.message);
    } else {
      addToast('success', 'Prodotto aggiornato', `Dati di "${editingProduct.name}" salvati con successo.`);
      setEditingProduct(null);
      await fetchData();
      if (targetId) {
        scrollToProduct(targetId);
      }
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

  // Lista fornitori univoci per suggerimenti rapidi
  const existingSuppliers = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.supplier && p.supplier.trim()) set.add(p.supplier.trim());
    });
    return Array.from(set).sort();
  }, [products]);

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
              <p className="text-xs text-slate-500">Gestione scorte, carichi da DDT e prelievi di magazzino</p>
            </div>
          </div>

          {/* Pulsanti Azione Rapida in Header */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveTab('carico')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-xs active:scale-98 ${
                activeTab === 'carico'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border-emerald-200/80'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Ricevi DDT / Carico
              {caricoItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-800 text-white">
                  {caricoItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('scarico')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-xs active:scale-98 ${
                activeTab === 'scarico'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100/80 border-rose-200/80'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
              Scarico Merce
              {scaricoItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-800 text-white">
                  {scaricoItems.length}
                </span>
              )}
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
              Carico Merce (DDT)
              {caricoItems.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500 text-white font-bold animate-pulse">
                  {caricoItems.length} in corso
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                  activeTab === 'carico' ? 'bg-emerald-700 text-white' : 'bg-slate-200/80 text-slate-700'
                }`}>
                  {movements.filter((m) => m.type === 'CARICO').length}
                </span>
              )}
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
              Scarico Merce
              {scaricoItems.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500 text-white font-bold animate-pulse">
                  {scaricoItems.length} in corso
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                  activeTab === 'scarico' ? 'bg-rose-700 text-white' : 'bg-slate-200/80 text-slate-700'
                }`}>
                  {movements.filter((m) => m.type === 'SCARICO').length}
                </span>
              )}
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
                          id={`product-row-${p.id}`}
                          key={p.id}
                          className={`transition-all duration-500 ${
                            highlightedProductId === p.id
                              ? 'bg-blue-100/90 ring-2 ring-blue-500 ring-inset shadow-md'
                              : isZero
                              ? 'bg-rose-50/25 hover:bg-slate-50/80'
                              : isLow
                              ? 'bg-amber-50/20 hover:bg-slate-50/80'
                              : 'hover:bg-slate-50/80'
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

        {/* ===================== TAB 2: REGISTRO CARICHI (RICEZIONE DDT CONTINUO) ===================== */}
        {activeTab === 'carico' && (
          <div className="space-y-6">
            {/* SEZIONE COMPILAZIONE DDT (SENZA POPUP) */}
            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden ring-1 ring-emerald-500/10">
              <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">Inserimento Merce da DDT Fornitore</h3>
                    <p className="text-xs text-emerald-100">Compila l&apos;intestazione del DDT e aggiungi tutti i prodotti della bolla in sequenza continua</p>
                  </div>
                </div>

                {caricoItems.length > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white text-emerald-800 shadow-xs">
                    {caricoItems.length} articoli pronti da caricare
                  </span>
                )}
              </div>

              <div className="p-5">
                {/* 1. Intestazione DDT (inserita una sola volta) */}
                <div className="grid grid-cols-3 gap-4 pb-4 mb-4 border-b border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fornitore / Mittente DDT *</label>
                    <input
                      type="text"
                      list="suppliers-list"
                      placeholder="Es. CWS-BOCO, ALMA, MONDO PULITO..."
                      value={caricoSupplier}
                      onChange={(e) => setCaricoSupplier(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold text-slate-900"
                    />
                    <datalist id="suppliers-list">
                      {existingSuppliers.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Riferimento / N. DDT (Opzionale)</label>
                    <input
                      type="text"
                      placeholder="Es. DDT 458/26"
                      value={caricoReference}
                      onChange={(e) => setCaricoReference(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Data Arrivo / Bolla *</label>
                    <input
                      type="date"
                      value={caricoDate}
                      onChange={(e) => setCaricoDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                    />
                  </div>
                </div>

                {/* 2. Riquadro aggiunta rapida articoli */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                  <p className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Aggiungi riga prodotto dal DDT:
                  </p>

                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Seleziona Articolo</label>
                      <select
                        value={caricoSelectedProductId}
                        onChange={(e) => handleCaricoProductSelect(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                      >
                        <option value="">-- Seleziona un articolo dalla bolla --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Giacenza attuale: {p.stock} pz)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quantità ricevuta</label>
                      <input
                        type="number"
                        min="1"
                        value={caricoQuantity}
                        onChange={(e) => setCaricoQuantity(parseInt(e.target.value) || 1)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCaricoItem(); }}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-center"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prezzo Unit. (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={caricoUnitPrice}
                        onChange={(e) => setCaricoUnitPrice(parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCaricoItem(); }}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-right"
                      />
                    </div>

                    <div className="col-span-2">
                      <button
                        type="button"
                        onClick={handleAddCaricoItem}
                        className="w-full py-2 px-3 text-xs font-bold text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200 border border-emerald-300/80 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 shadow-xs"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Inserisci riga
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Elenco degli articoli inseriti per questo DDT */}
                {caricoItems.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
                    <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs font-semibold text-slate-700">
                      <span>Articoli inseriti nel DDT in preparazione ({caricoItems.length})</span>
                      <span>
                        Totale Pezzi: <strong className="text-emerald-700">{caricoItems.reduce((acc, i) => acc + i.quantity, 0)}</strong> | 
                        Valore DDT: <strong className="text-emerald-700">{formatEuro(caricoItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0))}</strong>
                      </span>
                    </div>

                    <table className="w-full text-left text-xs divide-y divide-slate-100">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase">
                        <tr>
                          <th className="py-2.5 px-4">Prodotto</th>
                          <th className="py-2.5 px-3 text-center">Giacenza Prima</th>
                          <th className="py-2.5 px-3 text-center">Quantità Ricevuta</th>
                          <th className="py-2.5 px-3 text-center">Nuova Giacenza</th>
                          <th className="py-2.5 px-3 text-right">Prezzo Unit.</th>
                          <th className="py-2.5 px-3 text-right">Totale</th>
                          <th className="py-2.5 px-3 text-center">Rimuovi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {caricoItems.map((item) => (
                          <tr key={item.tempId} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{item.productName}</td>
                            <td className="py-2.5 px-3 text-center text-slate-500">{item.currentStock} pz</td>
                            <td className="py-2.5 px-3 text-center font-bold text-emerald-600 bg-emerald-50/50">+{item.quantity}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-800">{item.currentStock + item.quantity} pz</td>
                            <td className="py-2.5 px-3 text-right text-slate-600">{formatEuro(item.unitPrice)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatEuro(item.quantity * item.unitPrice)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => handleRemoveCaricoItem(item.tempId)}
                                className="text-rose-500 hover:text-rose-700 p-1 rounded-md hover:bg-rose-50"
                                title="Rimuovi questa riga"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl mb-4 bg-slate-50/30">
                    Nessun prodotto inserito nel DDT corrente. Seleziona l&apos;articolo in alto e clicca su &ldquo;Inserisci riga&rdquo;.
                  </div>
                )}

                {/* 4. Pulsanti di chiusura DDT */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={caricoItems.length === 0}
                    onClick={() => {
                      if (window.confirm('Vuoi annullare e svuotare le righe di questo DDT?')) {
                        setCaricoItems([]);
                        setCaricoReference('');
                      }
                    }}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      caricoItems.length === 0
                        ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200'
                        : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-200 cursor-pointer'
                    }`}
                  >
                    Svuota lista DDT
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || caricoItems.length === 0}
                    onClick={handleConcludeCarico}
                    className={`inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer ${
                      caricoItems.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-98 shadow-emerald-500/20'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {isSaving
                      ? 'Salvataggio carico in corso...'
                      : `Concludi Carico DDT (${caricoItems.length} ${caricoItems.length === 1 ? 'articolo' : 'articoli'})`}
                  </button>
                </div>
              </div>
            </div>

            {/* STORICO CARICHI PASSATI */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Registro Storico Carichi Merce</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Elenco di tutte le bolle ed entrate merce registrate in passato</p>
                </div>
                <span className="text-xs text-slate-500">
                  Totale carichi registrati: <strong>{movements.filter((m) => m.type === 'CARICO').length}</strong>
                </span>
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
                      <th className="py-3 px-5">Fornitore / DDT</th>
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
          </div>
        )}

        {/* ===================== TAB 3: REGISTRO SCARICHI (USCITA CONTINUA) ===================== */}
        {activeTab === 'scarico' && (
          <div className="space-y-6">
            {/* SEZIONE COMPILAZIONE SCARICO (SENZA POPUP) */}
            <div className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden ring-1 ring-rose-500/10">
              <div className="p-4 bg-gradient-to-r from-rose-500 to-red-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">Prelievo e Scarico Merce da Magazzino</h3>
                    <p className="text-xs text-rose-100">Imposta richiedente e reparto, quindi aggiungi tutti gli articoli da prelevare in una sola volta</p>
                  </div>
                </div>

                {scaricoItems.length > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white text-rose-800 shadow-xs">
                    {scaricoItems.length} articoli pronti da scaricare
                  </span>
                )}
              </div>

              <div className="p-5">
                {/* 1. Intestazione Scarico */}
                <div className="grid grid-cols-3 gap-4 pb-4 mb-4 border-b border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Richiedente / Operatore</label>
                    <input
                      type="text"
                      placeholder="Nome di chi preleva la merce"
                      value={scaricoRequester}
                      onChange={(e) => setScaricoRequester(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Destinazione / Reparto / Stanza</label>
                    <input
                      type="text"
                      placeholder="Es. Portineria, Uffici, Piano 2, Ristorante"
                      value={scaricoDestination}
                      onChange={(e) => setScaricoDestination(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Data Prelievo *</label>
                    <input
                      type="date"
                      value={scaricoDate}
                      onChange={(e) => setScaricoDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900"
                    />
                  </div>
                </div>

                {/* 2. Riquadro aggiunta rapida articoli da scaricare */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                  <p className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Aggiungi articolo da scaricare:
                  </p>

                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-8">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Seleziona Articolo</label>
                      <select
                        value={scaricoSelectedProductId}
                        onChange={(e) => setScaricoSelectedProductId(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-medium"
                      >
                        <option value="">-- Seleziona un articolo da prelevare --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id} disabled={p.stock === 0}>
                            {p.name} {p.stock === 0 ? '(ESAURITO 0 pz)' : `(Disponibili: ${p.stock} pz)`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quantità prelievo</label>
                      <input
                        type="number"
                        min="1"
                        value={scaricoQuantity}
                        onChange={(e) => setScaricoQuantity(parseInt(e.target.value) || 1)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddScaricoItem(); }}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-bold text-center"
                      />
                    </div>

                    <div className="col-span-2">
                      <button
                        type="button"
                        onClick={handleAddScaricoItem}
                        className="w-full py-2 px-3 text-xs font-bold text-rose-700 bg-rose-100/80 hover:bg-rose-200 border border-rose-300/80 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 shadow-xs"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Aggiungi riga
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Elenco degli articoli in scarico */}
                {scaricoItems.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
                    <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs font-semibold text-slate-700">
                      <span>Articoli da scaricare ({scaricoItems.length})</span>
                      <span>
                        Totale Pezzi in Prelievo: <strong className="text-rose-700">-{scaricoItems.reduce((acc, i) => acc + i.quantity, 0)}</strong>
                      </span>
                    </div>

                    <table className="w-full text-left text-xs divide-y divide-slate-100">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase">
                        <tr>
                          <th className="py-2.5 px-4">Prodotto</th>
                          <th className="py-2.5 px-3 text-center">Giacenza Attuale</th>
                          <th className="py-2.5 px-3 text-center">Quantità Scarico</th>
                          <th className="py-2.5 px-3 text-center">Giacenza Residua</th>
                          <th className="py-2.5 px-3 text-center">Rimuovi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {scaricoItems.map((item) => (
                          <tr key={item.tempId} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{item.productName}</td>
                            <td className="py-2.5 px-3 text-center text-slate-500">{item.currentStock} pz</td>
                            <td className="py-2.5 px-3 text-center font-bold text-rose-600 bg-rose-50/50">-{item.quantity}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-800">{item.currentStock - item.quantity} pz</td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => handleRemoveScaricoItem(item.tempId)}
                                className="text-rose-500 hover:text-rose-700 p-1 rounded-md hover:bg-rose-50"
                                title="Rimuovi questa riga"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl mb-4 bg-slate-50/30">
                    Nessun prodotto inserito nello scarico. Seleziona l&apos;articolo in alto e clicca su &ldquo;Aggiungi riga&rdquo;.
                  </div>
                )}

                {/* 4. Pulsante Concludi Scarico */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={scaricoItems.length === 0}
                    onClick={() => {
                      if (window.confirm('Vuoi annullare e svuotare questa lista di scarico?')) {
                        setScaricoItems([]);
                      }
                    }}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      scaricoItems.length === 0
                        ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200'
                        : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-200 cursor-pointer'
                    }`}
                  >
                    Svuota lista scarico
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || scaricoItems.length === 0}
                    onClick={handleConcludeScarico}
                    className={`inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer ${
                      scaricoItems.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-rose-600 text-white hover:bg-rose-700 active:scale-98 shadow-rose-500/20'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {isSaving
                      ? 'Registrazione scarico in corso...'
                      : `Concludi Scarico (${scaricoItems.length} ${scaricoItems.length === 1 ? 'articolo' : 'articoli'})`}
                  </button>
                </div>
              </div>
            </div>

            {/* STORICO SCARICHI PASSATI */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Registro Storico Scarichi Merce</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Elenco di tutti i prelievi e uscite registrate in passato</p>
                </div>
                <span className="text-xs text-slate-500">
                  Totale scarichi registrati: <strong>{movements.filter((m) => m.type === 'SCARICO').length}</strong>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-5">Data</th>
                      <th className="py-3 px-5">Prodotto</th>
                      <th className="py-3 px-4 text-center">Quantità</th>
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
                  list="suppliers-list-modal"
                  placeholder="Nome del fornitore o distributore"
                  value={newProductSupplier}
                  onChange={(e) => setNewProductSupplier(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <datalist id="suppliers-list-modal">
                  {existingSuppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
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
    </div>
  );
}
