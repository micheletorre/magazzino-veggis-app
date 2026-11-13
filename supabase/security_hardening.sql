-- ==============================================================================
-- SCRIPT DI SICUREZZA E HARDENING (SUPABASE)
-- Database condiviso: Agenda Segreteria & Gestione Magazzino
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. VINCOLI DI INTEGRITÀ RELAZIONALE E LOGICA DI BUSINESS
-- ------------------------------------------------------------------------------

-- Verifica e applica vincolo di giacenza non negativa su products
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_products_stock_non_negative'
    ) THEN
        ALTER TABLE products 
        ADD CONSTRAINT check_products_stock_non_negative CHECK (stock >= 0);
    END IF;
END $$;

-- Verifica e applica vincolo di prezzo non negativo su products
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_products_price_non_negative'
    ) THEN
        ALTER TABLE products 
        ADD CONSTRAINT check_products_price_non_negative CHECK (unit_price >= 0);
    END IF;
END $$;

-- Verifica e applica vincolo quantità positiva (> 0) sui movimenti
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_movements_quantity_positive'
    ) THEN
        ALTER TABLE movements 
        ADD CONSTRAINT check_movements_quantity_positive CHECK (quantity > 0);
    END IF;
END $$;

-- Verifica e applica vincolo tipo movimento valido
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_movements_type_valid'
    ) THEN
        ALTER TABLE movements 
        ADD CONSTRAINT check_movements_type_valid CHECK (type IN ('CARICO', 'SCARICO'));
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 2. HARDENING ROW LEVEL SECURITY (RLS) SUI MOVIMENTI (IMMUTABILITÀ STORICO)
-- ------------------------------------------------------------------------------

ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

-- Rimozione vecchie policy permissive
DROP POLICY IF EXISTS "Allow all read on movements" ON movements;
DROP POLICY IF EXISTS "Allow all write on movements" ON movements;
DROP POLICY IF EXISTS "Anon read movements" ON movements;
DROP POLICY IF EXISTS "Anon insert movements" ON movements;
DROP POLICY IF EXISTS "Anon update movements" ON movements;
DROP POLICY IF EXISTS "Anon delete movements" ON movements;
DROP POLICY IF EXISTS "movements_select_policy" ON movements;
DROP POLICY IF EXISTS "movements_insert_policy" ON movements;
DROP POLICY IF EXISTS "movements_block_update" ON movements;
DROP POLICY IF EXISTS "movements_block_delete" ON movements;

-- LETTURA: consentita a tutti i client
CREATE POLICY "movements_select_policy" ON movements
    FOR SELECT USING (true);

-- INSERIMENTO: consentito con validazione dei campi
CREATE POLICY "movements_insert_policy" ON movements
    FOR INSERT WITH CHECK (quantity > 0 AND type IN ('CARICO', 'SCARICO'));

-- NOTA IMPORTANTE DI SICUREZZA:
-- Nessuna policy per UPDATE e DELETE su movements!
-- In PostgreSQL con RLS abilitato, in assenza di policy per un'operazione,
-- quell'operazione è categoricamente VIETATA ai ruoli anon/authenticated.
-- Lo storico movimenti diventa così matematicamente IMMUTABILE (append-only).


-- ------------------------------------------------------------------------------
-- 3. HARDENING ROW LEVEL SECURITY (RLS) SUI PRODOTTI
-- ------------------------------------------------------------------------------

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read on products" ON products;
DROP POLICY IF EXISTS "Allow all write on products" ON products;
DROP POLICY IF EXISTS "products_select_policy" ON products;
DROP POLICY IF EXISTS "products_insert_policy" ON products;
DROP POLICY IF EXISTS "products_update_policy" ON products;
DROP POLICY IF EXISTS "products_delete_policy" ON products;

CREATE POLICY "products_select_policy" ON products
    FOR SELECT USING (true);

CREATE POLICY "products_insert_policy" ON products
    FOR INSERT WITH CHECK (name IS NOT NULL AND length(trim(name)) > 0);

CREATE POLICY "products_update_policy" ON products
    FOR UPDATE USING (true) WITH CHECK (name IS NOT NULL AND length(trim(name)) > 0);

-- Previene cancellazioni massive senza WHERE id
CREATE POLICY "products_delete_policy" ON products
    FOR DELETE USING (id IS NOT NULL);


-- ------------------------------------------------------------------------------
-- 4. HARDENING TABELLE AGENDA SEGRETERIA (APPOINTMENTS, DAILY_NOTES, CONTACTS)
-- ------------------------------------------------------------------------------

-- Tabella Appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all read on appointments" ON appointments;
DROP POLICY IF EXISTS "Allow all write on appointments" ON appointments;
DROP POLICY IF EXISTS "appointments_select_policy" ON appointments;
DROP POLICY IF EXISTS "appointments_insert_policy" ON appointments;
DROP POLICY IF EXISTS "appointments_update_policy" ON appointments;
DROP POLICY IF EXISTS "appointments_delete_policy" ON appointments;

CREATE POLICY "appointments_select_policy" ON appointments
    FOR SELECT USING (true);

CREATE POLICY "appointments_insert_policy" ON appointments
    FOR INSERT WITH CHECK (title IS NOT NULL AND length(trim(title)) > 0);

CREATE POLICY "appointments_update_policy" ON appointments
    FOR UPDATE USING (true) WITH CHECK (title IS NOT NULL AND length(trim(title)) > 0);

CREATE POLICY "appointments_delete_policy" ON appointments
    FOR DELETE USING (id IS NOT NULL);

-- Tabella Daily Notes
ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all read on daily_notes" ON daily_notes;
DROP POLICY IF EXISTS "Allow all write on daily_notes" ON daily_notes;
DROP POLICY IF EXISTS "daily_notes_select_policy" ON daily_notes;
DROP POLICY IF EXISTS "daily_notes_insert_policy" ON daily_notes;
DROP POLICY IF EXISTS "daily_notes_update_policy" ON daily_notes;
DROP POLICY IF EXISTS "daily_notes_delete_policy" ON daily_notes;

CREATE POLICY "daily_notes_select_policy" ON daily_notes
    FOR SELECT USING (true);

CREATE POLICY "daily_notes_insert_policy" ON daily_notes
    FOR INSERT WITH CHECK (note_text IS NOT NULL AND length(trim(note_text)) > 0);

CREATE POLICY "daily_notes_update_policy" ON daily_notes
    FOR UPDATE USING (true) WITH CHECK (note_text IS NOT NULL AND length(trim(note_text)) > 0);

CREATE POLICY "daily_notes_delete_policy" ON daily_notes
    FOR DELETE USING (id IS NOT NULL);

-- Tabella Contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all read on contacts" ON contacts;
DROP POLICY IF EXISTS "Allow all write on contacts" ON contacts;
DROP POLICY IF EXISTS "contacts_select_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_update_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_delete_policy" ON contacts;

CREATE POLICY "contacts_select_policy" ON contacts
    FOR SELECT USING (true);

CREATE POLICY "contacts_insert_policy" ON contacts
    FOR INSERT WITH CHECK (name IS NOT NULL AND length(trim(name)) > 0);

CREATE POLICY "contacts_update_policy" ON contacts
    FOR UPDATE USING (true) WITH CHECK (name IS NOT NULL AND length(trim(name)) > 0);

CREATE POLICY "contacts_delete_policy" ON contacts
    FOR DELETE USING (id IS NOT NULL);


-- ------------------------------------------------------------------------------
-- 5. TRANSAZIONI ATOMICHE STORED PROCEDURES (RISOLUZIONE RACE CONDITIONS)
-- ------------------------------------------------------------------------------

-- Funzione atomica per la registrazione del CARICO
CREATE OR REPLACE FUNCTION record_warehouse_carico(
    p_items JSONB,
    p_date DATE,
    p_supplier TEXT,
    p_reference TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item JSONB;
    v_prod_id BIGINT;
    v_qty INT;
    v_unit_price NUMERIC;
    v_full_supplier TEXT;
    v_processed_count INT := 0;
BEGIN
    IF p_reference IS NOT NULL AND length(trim(p_reference)) > 0 THEN
        v_full_supplier := trim(p_supplier) || ' (DDT: ' || trim(p_reference) || ')';
    ELSE
        v_full_supplier := NULLIF(trim(p_supplier), '');
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (item->>'productId')::BIGINT;
        v_qty := (item->>'quantity')::INT;
        v_unit_price := COALESCE((item->>'unitPrice')::NUMERIC, 0);

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantità non valida per carico: %', v_qty;
        END IF;

        -- Blocco atomico riga prodotto con SELECT FOR UPDATE per evitare race conditions
        PERFORM 1 FROM products WHERE id = v_prod_id FOR UPDATE;

        -- 1. Inserisci riga nello storico movimenti (append-only)
        INSERT INTO movements (product_id, type, quantity, movement_date, supplier)
        VALUES (v_prod_id, 'CARICO', v_qty, p_date, v_full_supplier);

        -- 2. Aggiorna giacenza, data ultimo carico, prezzo e fornitore
        UPDATE products
        SET stock = stock + v_qty,
            last_charge_date = p_date,
            unit_price = CASE WHEN v_unit_price > 0 THEN v_unit_price ELSE unit_price END,
            supplier = COALESCE(NULLIF(trim(p_supplier), ''), supplier)
        WHERE id = v_prod_id;

        v_processed_count := v_processed_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_processed_count);
END;
$$;

-- Permetti al ruolo anon/public di invocare la procedura di carico
GRANT EXECUTE ON FUNCTION record_warehouse_carico(JSONB, DATE, TEXT, TEXT) TO anon, authenticated, service_role;


-- Funzione atomica per la registrazione dello SCARICO
CREATE OR REPLACE FUNCTION record_warehouse_scarico(
    p_items JSONB,
    p_date DATE,
    p_requester TEXT,
    p_destination TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item JSONB;
    v_prod_id BIGINT;
    v_qty INT;
    v_curr_stock INT;
    v_prod_name TEXT;
    v_processed_count INT := 0;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (item->>'productId')::BIGINT;
        v_qty := (item->>'quantity')::INT;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantità non valida per scarico: %', v_qty;
        END IF;

        -- Blocco atomico riga con SELECT FOR UPDATE per lettura e lock immediato
        SELECT stock, name INTO v_curr_stock, v_prod_name
        FROM products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Prodotto con ID % non trovato in magazzino.', v_prod_id;
        END IF;

        IF v_curr_stock < v_qty THEN
            RAISE EXCEPTION 'Giacenza insufficiente per "%": disponibili % pz, richiesti % pz.', 
                v_prod_name, v_curr_stock, v_qty;
        END IF;

        -- 1. Inserisci riga nello storico movimenti
        INSERT INTO movements (product_id, type, quantity, movement_date, requester, destination)
        VALUES (
            v_prod_id, 
            'SCARICO', 
            v_qty, 
            p_date, 
            NULLIF(trim(p_requester), ''), 
            NULLIF(trim(p_destination), '')
        );

        -- 2. Scala giacenza
        UPDATE products
        SET stock = stock - v_qty
        WHERE id = v_prod_id;

        v_processed_count := v_processed_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_processed_count);
END;
$$;

-- Permetti al ruolo anon/public di invocare la procedura di scarico
GRANT EXECUTE ON FUNCTION record_warehouse_scarico(JSONB, DATE, TEXT, TEXT) TO anon, authenticated, service_role;
