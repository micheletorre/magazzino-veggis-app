'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Product, Movement } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function formatDateToItalian(dateString: string | null): string {
  if (!dateString) return '-';
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'giacenza' | 'carico' | 'scarico'>('giacenza');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'CARICO' | 'SCARICO'>('CARICO');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [movementDate, setMovementDate] = useState('');
  const [requester, setRequester] = useState('');
  const [destination, setDestination] = useState('');
  const [supplier, setSupplier] = useState('');

  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductStock, setNewProductStock] = useState<number>(0);
  const [newProductPrice, setNewProductPrice] = useState<number>(0);
  const [newProductSupplier, setNewProductSupplier] = useState('');

  const [webPriceProduct, setWebPriceProduct] = useState<Product | null>(null);
  const [inputWebPrice, setInputWebPrice] = useState<string>('');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editStock, setEditStock] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editSupplier, setEditSupplier] = useState<string>('');

  useEffect(() => {
    setMovementDate(new Date().toISOString().split('T')[0]);
    fetchData();
  }, []);

  async function fetchData() {
    const { data: prodData } = await supabase.from('products').select('*').order('name');
    const { data: movData } = await supabase.from('movements').select('*').order('created_at', { ascending: false });

    if (prodData) setProducts(prodData);
    if (movData) setMovements(movData);
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
    
    if (isNaN(newPrice)) {
      alert('Inserisci un prezzo valido');
      return;
    }

    const { error } = await supabase
      .from('products')
      .update({ unit_price: newPrice })
      .eq('id', webPriceProduct.id);

    if (error) {
      alert('Errore durante l\'aggiornamento del prezzo');
      console.error(error);
    } else {
      setWebPriceProduct(null);
      setInputWebPrice('');
      fetchData();
    }
  };

  const handleSaveEditProduct = async () => {
    if (!editingProduct) return;

    const { error } = await supabase
      .from('products')
      .update({ stock: editStock, unit_price: editPrice, supplier: editSupplier })
      .eq('id', editingProduct.id);

    if (error) {
      alert('Errore durante la modifica del prodotto');
      console.error(error);
    } else {
      setEditingProduct(null);
      fetchData();
    }
  };

  // Funzione per eliminare il prodotto
  const handleDeleteProduct = async () => {
    if (!editingProduct) return;

    const confirmDelete = window.confirm(`Sei sicuro di voler eliminare definitivamente "${editingProduct.name}"?`);
    if (!confirmDelete) return;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', editingProduct.id);

    if (error) {
      alert('Errore durante l\'eliminazione del prodotto');
      console.error(error);
    } else {
      setEditingProduct(null);
      fetchData();
    }
  };

  const handleSaveNewProduct = async () => {
    if (!newProductName.trim()) {
      alert('Inserisci il nome del prodotto');
      return;
    }

    const { error } = await supabase.from('products').insert([
      {
        name: newProductName.trim(),
        stock: newProductStock,
        unit_price: newProductPrice,
        supplier: newProductSupplier,
      },
    ]);

    if (error) {
      alert('Errore durante la creazione del nuovo prodotto');
      console.error(error);
    } else {
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
      alert('Seleziona un prodotto');
      return;
    }

    const targetProduct = products.find((p) => p.id === selectedProductId);
    if (!targetProduct) return;

    if (modalType === 'SCARICO' && targetProduct.stock < quantity) {
      alert('Quantità non disponibile in giacenza!');
      return;
    }

    const newStock = modalType === 'CARICO' 
      ? targetProduct.stock + quantity 
      : targetProduct.stock - quantity;

    const { error: movError } = await supabase.from('movements').insert([
      {
        product_id: selectedProductId,
        type: modalType,
        quantity: quantity,
        movement_date: movementDate,
        requester: modalType === 'SCARICO' ? requester : null,
        destination: modalType === 'SCARICO' ? destination : null,
        supplier: modalType === 'CARICO' ? supplier : null,
        unit_price: targetProduct.unit_price || 0,
      },
    ]);

    if (movError) {
      alert('Errore nel salvataggio del movimento');
      console.error(movError);
      return;
    }

    const updateData: Partial<Product> = { stock: newStock };
    if (modalType === 'CARICO') {
      updateData.last_charge_date = movementDate;
      if (supplier) {
        updateData.supplier = supplier;
      }
    }

    const { error: prodError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', selectedProductId);

    if (prodError) {
      alert('Errore nell\'aggiornamento dello stock del prodotto');
      console.error(prodError);
      return;
    }

    setIsModalOpen(false);
    setSelectedProductId('');
    setQuantity(1);
    setRequester('');
    setDestination('');
    setSupplier('');
    fetchData();
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = products.reduce((acc, p) => acc + p.stock * (p.unit_price || 0), 0);

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '24px' }}>Magazzino Master Veggis</h1>

      {webPriceProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '400px', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Aggiorna Prezzo Web</h3>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
              Inserisci il prezzo rilevato per: <strong>{webPriceProduct.name}</strong>
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 'bold' }}>Prezzo Unitario (€):</label>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={inputWebPrice}
                onChange={(e) => setInputWebPrice(e.target.value)}
                placeholder="es. 2.50"
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '16px' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveWebPrice(); }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setWebPriceProduct(null)}
                style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSaveWebPrice}
                style={{ padding: '8px 16px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                💾 Salva Prezzo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Modifica Prodotto (con tasto Elimina rosso in basso a sinistra) */}
      {editingProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '400px', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Modifica Prodotto</h3>
            <p style={{ fontWeight: 'bold', marginBottom: '16px' }}>{editingProduct.name}</p>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Giacenza Attuale:</label>
              <input
                type="number"
                value={editStock}
                onChange={(e) => setEditStock(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Prezzo Unitario (€):</label>
              <input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Fornitore:</label>
              <input
                type="text"
                value={editSupplier}
                onChange={(e) => setEditSupplier(e.target.value)}
                placeholder="Nome fornitore"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <button
                onClick={handleDeleteProduct}
                style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
              >
                🗑️ Elimina
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditingProduct(null)}
                  style={{ padding: '8px 12px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveEditProduct}
                  style={{ padding: '8px 12px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isNewProductModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '450px', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#0070f3' }}>➕ Inserisci Nuovo Prodotto</h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Nome Prodotto:</label>
              <input
                type="text"
                autoFocus
                placeholder="Es. CARTA IGIENICA ROTOLONI"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Giacenza Iniziale:</label>
              <input
                type="number"
                value={newProductStock}
                onChange={(e) => setNewProductStock(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Prezzo Unitario (€):</label>
              <input
                type="number"
                step="0.01"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Fornitore:</label>
              <input
                type="text"
                placeholder="Nome del fornitore"
                value={newProductSupplier}
                onChange={(e) => setNewProductSupplier(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsNewProductModalOpen(false)}
                style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSaveNewProduct}
                style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                💾 Salva Prodotto
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '500px', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: modalType === 'CARICO' ? '#28a745' : '#dc3545' }}>
              {modalType === 'CARICO' ? '➕ Registra Carico Merce' : '➖ Registra Scarico Merce'}
            </h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Seleziona Prodotto:</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="">-- Seleziona un articolo --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Giacenza: {p.stock})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Quantità:</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Data Movimento:</label>
              <input
                type="date"
                value={movementDate}
                onChange={(e) => setMovementDate(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            {modalType === 'CARICO' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Fornitore:</label>
                <input
                  type="text"
                  placeholder="Nome del fornitore"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>
            )}

            {modalType === 'SCARICO' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Richiedente:</label>
                  <input
                    type="text"
                    placeholder="Nome di chi richiede la merce"
                    value={requester}
                    onChange={(e) => setRequester(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Destinazione:</label>
                  <input
                    type="text"
                    placeholder="Reparto / Settore / Stanza"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSaveMovement}
                style={{ padding: '10px 20px', backgroundColor: modalType === 'CARICO' ? '#28a745' : '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Conferma {modalType === 'CARICO' ? 'Carico' : 'Scarico'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #eee', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('giacenza')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'giacenza' ? '3px solid #0070f3' : 'none',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'giacenza' ? 'bold' : 'normal',
            color: activeTab === 'giacenza' ? '#0070f3' : '#333',
            cursor: 'pointer',
          }}
        >
          📦 Giacenza Magazzino
        </button>
        <button
          onClick={() => setActiveTab('carico')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'carico' ? '3px solid #28a745' : 'none',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'carico' ? 'bold' : 'normal',
            color: activeTab === 'carico' ? '#28a745' : '#333',
            cursor: 'pointer',
          }}
        >
          ➕ Carico Merce
        </button>
        <button
          onClick={() => setActiveTab('scarico')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'scarico' ? '3px solid #dc3545' : 'none',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'scarico' ? 'bold' : 'normal',
            color: activeTab === 'scarico' ? '#dc3545' : '#333',
            cursor: 'pointer',
          }}
        >
          ➖ Scarico Merce
        </button>
      </div>

      {activeTab === 'giacenza' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', backgroundColor: '#eef6ff', padding: '12px 20px', borderRadius: '8px' }}>
            <span>Totale Articoli in Anagrafica: <strong>{products.length}</strong></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span>Valore Complessivo Magazzino: <strong style={{ color: '#0070f3', fontSize: '18px' }}>€ {totalValue.toFixed(2)}</strong></span>
              <button
                onClick={() => setIsNewProductModalOpen(true)}
                style={{ padding: '8px 16px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ➕ Nuovo Prodotto
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Cerca prodotto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '16px', borderRadius: '6px', border: '1px solid #ccc' }}
          />

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '12px' }}>Prodotto</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Giacenza Attuale</th>
                <th style={{ padding: '12px' }}>Prezzo Medio Unitario (€)</th>
                <th style={{ padding: '12px' }}>Valore Totale (€)</th>
                <th style={{ padding: '12px' }}>Fornitore</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Ultimo Carico</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const isLowStock = p.stock <= 2;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isLowStock ? '#fff0f0' : 'transparent' }}>
                    <td style={{ padding: '12px', fontWeight: '600' }}>
                      {p.name} 
                      {isLowStock && <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dc3545', color: '#fff' }}>SCORTA MINIMA</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{p.stock}</td>
                    <td style={{ padding: '12px' }}>€ {(Number(p.unit_price) || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>€ {(p.stock * (p.unit_price || 0)).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>{p.supplier || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{formatDateToItalian(p.last_charge_date)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <button 
                          onClick={() => handleWebPriceSearch(p)} 
                          title="Cerca prezzo medio sul web" 
                          style={{ padding: '6px 10px', backgroundColor: '#0070f3', color: '#fff', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                        >
                          <span>🌐</span> Prezzo Web
                        </button>
                        <button 
                          onClick={() => { setEditingProduct(p); setEditStock(p.stock); setEditPrice(p.unit_price || 0); setEditSupplier(p.supplier || ''); }} 
                          style={{ padding: '6px 10px', backgroundColor: '#6c757d', color: '#fff', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                        >
                          <span>✏️</span> Modifica
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {activeTab === 'carico' && (
        <div>
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <button
              onClick={() => { setModalType('CARICO'); setIsModalOpen(true); }}
              style={{ padding: '12px 24px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ➕ Registra Carico Merce
            </button>
          </div>
          <h3>Storico Registro Carichi</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px' }}>Data Arrivo</th>
                <th style={{ padding: '10px' }}>Prodotto</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Quantità</th>
                <th style={{ padding: '10px' }}>Prezzo Unitario</th>
                <th style={{ padding: '10px' }}>Fornitore</th>
              </tr>
            </thead>
            <tbody>
              {movements.filter((m) => m.type === 'CARICO').map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{formatDateToItalian(m.movement_date)}</td>
                  <td style={{ padding: '10px', fontWeight: '600' }}>{products.find(p => p.id === m.product_id)?.name || 'Prodotto eliminato'}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>{m.quantity}</td>
                  <td style={{ padding: '10px' }}>€ {(m.unit_price || 0).toFixed(2)}</td>
                  <td style={{ padding: '10px' }}>{m.supplier || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'scarico' && (
        <div>
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <button
              onClick={() => { setModalType('SCARICO'); setIsModalOpen(true); }}
              style={{ padding: '12px 24px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ➖ Registra Scarico Merce
            </button>
          </div>
          <h3>Storico Registro Scarichi</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px' }}>Data</th>
                <th style={{ padding: '10px' }}>Prodotto</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Quantità</th>
                <th style={{ padding: '10px' }}>Richiedente</th>
                <th style={{ padding: '10px' }}>Destinazione</th>
              </tr>
            </thead>
            <tbody>
              {movements.filter((m) => m.type === 'SCARICO').map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{formatDateToItalian(m.movement_date)}</td>
                  <td style={{ padding: '10px', fontWeight: '600' }}>{products.find(p => p.id === m.product_id)?.name || 'Prodotto eliminato'}</td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#dc3545', fontWeight: '700' }}>-{m.quantity}</td>
                  <td style={{ padding: '10px' }}>{m.requester || '-'}</td>
                  <td style={{ padding: '10px' }}>{m.destination || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}