import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

const MAX_PAGE_SIZE = 1000;

const getAdminClient = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Supabase credentials are not configured.');
    }

    return createServerClient(url, serviceKey, {
        cookies: {
            getAll() {
                return [];
            },
            setAll() {
                // API routes do not need cookie persistence
            },
        },
    });
};

const normalizeCellValue = (value: unknown) => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return value;
};

const toCsvValue = (value: unknown) => {
    const normalized = normalizeCellValue(value);
    const text = String(normalized);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const fetchAllRows = async (
    supabase: SupabaseClient,
    viewName: string,
    participantIds: string[]
) => {
    let from = 0;
    const records: Record<string, unknown>[] = [];

    while (true) {
        let query = supabase
            .from(viewName)
            .select('*')
            .range(from, from + MAX_PAGE_SIZE - 1);

        if (participantIds.length > 0) {
            query = query.in('participant_id', participantIds);
        }

        const { data, error } = await query;

        if (error) throw error;
        const chunk = (data ?? []) as Record<string, unknown>[];
        records.push(...chunk);
        if (chunk.length < MAX_PAGE_SIZE) break;
        from += MAX_PAGE_SIZE;
    }

    return records;
};

export async function GET(request: Request) {
    try {
        const supabase = getAdminClient();
        const { searchParams } = new URL(request.url);
        const rawParticipantIds = searchParams.getAll('participantId');
        const participantIds = rawParticipantIds
            .flatMap(value => value.split(','))
            .map(value => value.trim())
            .filter(Boolean);
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const records = await fetchAllRows(supabase, 'v_trial_long', participantIds);

        let csv = '';
        if (records.length === 0) {
            csv = 'note\nデータがありません\n';
        } else {
            const headers = Object.keys(records[0]);
            csv += `${headers.join(',')}\n`;
            for (const row of records) {
                const line = headers.map((header) => toCsvValue(row[header])).join(',');
                csv += `${line}\n`;
            }
        }

        const fileName = `v-trial-long-${timestamp}.csv`;
        const csvWithBom = `\uFEFF${csv}`;
        return new NextResponse(csvWithBom, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'X-CSV-Filename': fileName,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Failed to create v_trial_long CSV:', error);
        return NextResponse.json({ error: 'Failed to create CSV' }, { status: 500 });
    }
}
