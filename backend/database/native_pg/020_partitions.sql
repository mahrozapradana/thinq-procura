CREATE OR REPLACE FUNCTION native_app.ensure_monthly_partition(table_name text, start_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    partition_name text;
    from_ts timestamptz;
    to_ts timestamptz;
BEGIN
    from_ts := date_trunc('month', start_month::timestamp);
    to_ts := from_ts + interval '1 month';
    partition_name := format('%s_%s', table_name, to_char(from_ts, 'YYYYMM'));

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS native_app.%I PARTITION OF native_app.%I FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        table_name,
        from_ts,
        to_ts
    );
END;
$$;

CREATE OR REPLACE FUNCTION native_app.ensure_partition_window(months_back integer DEFAULT 1, months_ahead integer DEFAULT 12)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    table_name text;
    month_cursor date;
    start_bound date;
    end_bound date;
    transaction_tables text[] := ARRAY[
        'prs',
        'pos',
        'tenders',
        'goods_receipts',
        'goods_returns',
        'customs_docs',
        'shipments',
        'invoices',
        'ls_documents',
        'notifications',
        'po_messages',
        'bc_audit'
    ];
BEGIN
    start_bound := (date_trunc('month', now())::date - make_interval(months => months_back));
    end_bound := (date_trunc('month', now())::date + make_interval(months => months_ahead));

    FOREACH table_name IN ARRAY transaction_tables LOOP
        month_cursor := start_bound;
        WHILE month_cursor <= end_bound LOOP
            PERFORM native_app.ensure_monthly_partition(table_name, month_cursor);
            month_cursor := (month_cursor + interval '1 month')::date;
        END LOOP;
    END LOOP;
END;
$$;

SELECT native_app.ensure_partition_window(2, 18);