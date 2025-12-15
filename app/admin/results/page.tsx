'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, BarChart3, Home, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { experimentConfig } from '@/lib/config/experiment';

type ConditionType = 'static' | 'personalized';
type ConditionFilter = 'all' | ConditionType;
type RtMode = 'all' | 'correctOnly';

interface ApiBlock {
    id: string;
    block_number: number;
    accuracy: number | null;
    average_rt: number | null;
    average_rt_correct_only: number | null;
    completed_at: string | null;
}

interface ApiExperiment {
    id: string;
    condition_type: ConditionType;
    started_at: string | null;
    completed_at: string | null;
    blocks?: ApiBlock[] | null;
}

interface ApiParticipant {
    id: string;
    name: string | null;
    nickname: string | null;
    created_at: string;
    experiments: ApiExperiment[];
}

interface BlockMetric {
    participantId: string;
    participantLabel: string;
    experimentId: string;
    conditionType: ConditionType;
    blockNumber: number;
    accuracy: number | null;
    averageRt: number | null;
    averageRtCorrectOnly: number | null;
    completedAt: Date | null;
}

interface ParticipantWithMetrics {
    id: string;
    label: string;
    createdAt: Date;
    metrics: BlockMetric[];
}

interface AggregatedRow {
    blockNumber: number;
    contributorCount: number;
    avgAccuracy: number | null;
    avgRt: number | null;
}

const conditionDisplay: Record<ConditionType, string> = {
    static: 'Static',
    personalized: 'Personalized',
};

const conditionOrder: Record<ConditionType, number> = {
    static: 0,
    personalized: 1,
};

const rtModeCopy: Record<RtMode, { title: string; description: string }> = {
    all: {
        title: '不正解を含むRT',
        description: '平均反応時間にすべての試行を含めます（デフォルト）。',
    },
    correctOnly: {
        title: '正解のみのRT',
        description: '反応時間を正解試行に限定します。',
    },
};

const conditionFilterCopy: Record<ConditionFilter, string> = {
    all: '両条件',
    static: 'Static',
    personalized: 'Personalized',
};

export default function AdminResultsPage() {
    const [participants, setParticipants] = useState<ApiParticipant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
    const [participantCondition, setParticipantCondition] = useState<ConditionFilter>('all');
    const [aggregateCondition, setAggregateCondition] = useState<ConditionFilter>('all');
    const [rtMode, setRtMode] = useState<RtMode>('all');
    const [showDetailCharts, setShowDetailCharts] = useState(false);
    const [showAggregateCharts, setShowAggregateCharts] = useState(false);
    const selectAllRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await fetch('/api/admin/participants', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('参加者データの取得に失敗しました');
                }
                const data = await response.json() as { participants: ApiParticipant[] };
                setParticipants(data.participants ?? []);
            } catch (err) {
                console.error('Failed to load admin analytics payload:', err);
                setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const toggleParticipantSelection = (participantId: string) => {
        setSelectedParticipantIds(prev => {
            if (prev.includes(participantId)) {
                return prev.filter(id => id !== participantId);
            }
            return [...prev, participantId];
        });
    };

    const participantsWithMetrics = useMemo<ParticipantWithMetrics[]>(() => {
        return participants.map(part => {
            const label = part.nickname || part.name || `ID ${part.id.slice(0, 8)}`;
            const metrics: BlockMetric[] = (part.experiments ?? []).flatMap(exp => {
                const blocks = exp.blocks ?? [];
                return blocks.map(block => ({
                    participantId: part.id,
                    participantLabel: label,
                    experimentId: exp.id,
                    conditionType: exp.condition_type,
                    blockNumber: block.block_number,
                    accuracy: block.accuracy,
                    averageRt: block.average_rt,
                    averageRtCorrectOnly: block.average_rt_correct_only,
                    completedAt: block.completed_at ? new Date(block.completed_at) : null,
                }));
            });

            const sortedMetrics = metrics.sort((a, b) => {
                if (a.conditionType === b.conditionType) {
                    return a.blockNumber - b.blockNumber;
                }
                return conditionOrder[a.conditionType] - conditionOrder[b.conditionType];
            });

            return {
                id: part.id,
                label,
                createdAt: new Date(part.created_at),
                metrics: sortedMetrics,
            };
        }).filter(part => part.metrics.length > 0);
    }, [participants]);

    const allParticipantIds = useMemo(() => participantsWithMetrics.map(participant => participant.id), [participantsWithMetrics]);

    useEffect(() => {
        if (!participantsWithMetrics.length) return;
        setSelectedParticipantIds(prev => (prev.length ? prev : [participantsWithMetrics[0].id]));
    }, [participantsWithMetrics]);

    const blockMetrics = useMemo(() => participantsWithMetrics.flatMap(p => p.metrics), [participantsWithMetrics]);

    const selectedMetrics = useMemo(() => {
        if (!selectedParticipantIds.length) {
            return [];
        }
        return blockMetrics.filter(metric => selectedParticipantIds.includes(metric.participantId));
    }, [blockMetrics, selectedParticipantIds]);

    const singleSelectedId = selectedParticipantIds.length === 1 ? selectedParticipantIds[0] : null;
    const hasMultipleSelection = selectedParticipantIds.length > 1;

    const allSelected = allParticipantIds.length > 0 && allParticipantIds.every(id => selectedParticipantIds.includes(id));
    const isIndeterminate = selectedParticipantIds.length > 0 && !allSelected;

    const handleToggleSelectAllParticipants = () => {
        if (!allParticipantIds.length) return;
        setSelectedParticipantIds(allSelected ? [] : [...allParticipantIds]);
    };

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = isIndeterminate;
        }
    }, [isIndeterminate]);

    const selectedParticipant = useMemo(
        () => (singleSelectedId ? participantsWithMetrics.find(p => p.id === singleSelectedId) ?? null : null),
        [participantsWithMetrics, singleSelectedId]
    );

    useEffect(() => {
        setShowDetailCharts(false);
    }, [singleSelectedId, participantCondition]);

    useEffect(() => {
        if (!hasMultipleSelection) {
            setShowAggregateCharts(false);
        }
    }, [hasMultipleSelection]);

    const halfPoint = Math.ceil(experimentConfig.totalBlocks / 2);

    const filteredParticipantMetrics = useMemo(() => {
        if (!selectedParticipant) return [];
        return selectedParticipant.metrics.filter(metric =>
            participantCondition === 'all' ? true : metric.conditionType === participantCondition
        );
    }, [participantCondition, selectedParticipant]);

    const participantSummary = useMemo(() => {
        if (!filteredParticipantMetrics.length) return null;
        const accuracyValues = filteredParticipantMetrics
            .map(m => m.accuracy)
            .filter((value): value is number => typeof value === 'number');
        const rtValues = filteredParticipantMetrics
            .map(m => getRtValue(m, rtMode))
            .filter((value): value is number => typeof value === 'number');

        const avgAccuracy = accuracyValues.length
            ? Math.round(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length)
            : null;
        const avgRt = rtValues.length
            ? Math.round(rtValues.reduce((sum, value) => sum + value, 0) / rtValues.length)
            : null;

        return { avgAccuracy, avgRt };
    }, [filteredParticipantMetrics, rtMode]);

    const participantCharts = useMemo(() => {
        return {
            accuracy: filteredParticipantMetrics.map(metric => ({
                x: metric.blockNumber,
                y: metric.accuracy,
                label: `Block ${metric.blockNumber}`,
            })),
            rt: filteredParticipantMetrics.map(metric => ({
                x: metric.blockNumber,
                y: getRtValue(metric, rtMode),
                label: `Block ${metric.blockNumber}`,
            })),
        };
    }, [filteredParticipantMetrics, rtMode]);

    const aggregatedRows = useMemo<AggregatedRow[]>(() => {
        const filtered = selectedMetrics.filter(metric =>
            aggregateCondition === 'all' ? true : metric.conditionType === aggregateCondition
        );

        const map = new Map<number, { accuracy: number[]; rt: number[]; contributors: number }>();

        filtered.forEach(metric => {
            const rtValue = getRtValue(metric, rtMode);
            if (!map.has(metric.blockNumber)) {
                map.set(metric.blockNumber, { accuracy: [], rt: [], contributors: 0 });
            }
            const entry = map.get(metric.blockNumber)!;
            if (typeof metric.accuracy === 'number') {
                entry.accuracy.push(metric.accuracy);
            }
            if (typeof rtValue === 'number') {
                entry.rt.push(rtValue);
            }
            entry.contributors += 1;
        });

        return Array.from(map.entries())
            .sort(([a], [b]) => a - b)
            .map(([blockNumber, entry]) => ({
                blockNumber,
                contributorCount: entry.contributors,
                avgAccuracy: entry.accuracy.length
                    ? Math.round(entry.accuracy.reduce((sum, value) => sum + value, 0) / entry.accuracy.length)
                    : null,
                avgRt: entry.rt.length
                    ? Math.round(entry.rt.reduce((sum, value) => sum + value, 0) / entry.rt.length)
                    : null,
            }));
    }, [aggregateCondition, selectedMetrics, rtMode]);

    const conditionBlockRows = useMemo(() => {
        const buckets: Record<ConditionType, Map<number, { accuracy: number[]; rt: number[] }>> = {
            static: new Map(),
            personalized: new Map(),
        };

        selectedMetrics.forEach(metric => {
            const bucket = buckets[metric.conditionType];
            if (!bucket.has(metric.blockNumber)) {
                bucket.set(metric.blockNumber, { accuracy: [], rt: [] });
            }
            const entry = bucket.get(metric.blockNumber)!;
            if (typeof metric.accuracy === 'number') {
                entry.accuracy.push(metric.accuracy);
            }
            const rtValue = getRtValue(metric, rtMode);
            if (typeof rtValue === 'number') {
                entry.rt.push(rtValue);
            }
        });

        const summarize = (entry?: { accuracy: number[]; rt: number[] }) => ({
            accuracy: entry && entry.accuracy.length
                ? Math.round(entry.accuracy.reduce((sum, value) => sum + value, 0) / entry.accuracy.length)
                : null,
            rt: entry && entry.rt.length
                ? Math.round(entry.rt.reduce((sum, value) => sum + value, 0) / entry.rt.length)
                : null,
        });

        const blockNumbers = Array.from(
            new Set([
                ...Array.from(buckets.static.keys()),
                ...Array.from(buckets.personalized.keys())
            ])
        ).sort((a, b) => a - b);

        return blockNumbers.map(blockNumber => ({
            blockNumber,
            static: summarize(buckets.static.get(blockNumber)),
            personalized: summarize(buckets.personalized.get(blockNumber)),
        }));
    }, [rtMode, selectedMetrics]);

    const halfComparison = useMemo(() => {
        const average = (values: number[]) =>
            values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

        const build = (condition: ConditionType) => {
            const first = { accuracy: [] as number[], rt: [] as number[] };
            const second = { accuracy: [] as number[], rt: [] as number[] };

            selectedMetrics
                .filter(metric => metric.conditionType === condition)
                .forEach(metric => {
                    const bucket = metric.blockNumber <= halfPoint ? first : second;
                    if (typeof metric.accuracy === 'number') {
                        bucket.accuracy.push(metric.accuracy);
                    }
                    const rtValue = getRtValue(metric, rtMode);
                    if (typeof rtValue === 'number') {
                        bucket.rt.push(rtValue);
                    }
                });

            return {
                firstHalfAccuracy: average(first.accuracy),
                secondHalfAccuracy: average(second.accuracy),
                firstHalfRt: average(first.rt),
                secondHalfRt: average(second.rt),
            };
        };

        return {
            static: build('static'),
            personalized: build('personalized'),
        };
    }, [halfPoint, rtMode, selectedMetrics]);

    const aggregatedSummary = useMemo(() => {
        if (!aggregatedRows.length) return null;
        const accuracyValues = aggregatedRows
            .map(row => row.avgAccuracy)
            .filter((value): value is number => typeof value === 'number');
        const rtValues = aggregatedRows
            .map(row => row.avgRt)
            .filter((value): value is number => typeof value === 'number');

        return {
            avgAccuracy: accuracyValues.length
                ? Math.round(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length)
                : null,
            avgRt: rtValues.length
                ? Math.round(rtValues.reduce((sum, value) => sum + value, 0) / rtValues.length)
                : null,
        };
    }, [aggregatedRows]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Card className="w-96">
                    <CardContent className="p-6">
                        <div className="text-center space-y-4">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                            <p className="text-muted-foreground">実験結果を集計しています...</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8 space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">実験結果ビュー</h1>
                        <p className="mt-2 text-muted-foreground">
                            ブロック単位の反応時間と正答率を参加者別・全体平均で確認できます
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/admin">
                                <Home className="mr-2 h-4 w-4" />
                                ダッシュボードに戻る
                            </Link>
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (typeof window !== 'undefined') {
                                    window.location.reload();
                                }
                            }}
                        >
                            <BarChart3 className="mr-2 h-4 w-4" />
                            データを再取得
                        </Button>
                    </div>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>表示設定</CardTitle>
                        <CardDescription>反応時間の集計方法を切り替えて解析の観点を揃えます</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm font-medium mb-2">反応時間の集計モード</p>
                            <RadioGroup
                                value={rtMode}
                                onValueChange={value => setRtMode(value as RtMode)}
                                className="flex flex-col gap-2 sm:flex-row"
                            >
                                {(['all', 'correctOnly'] as RtMode[]).map(mode => (
                                    <label
                                        key={mode}
                                        className={cn(
                                            'flex flex-1 cursor-pointer items-center gap-3 rounded-md border p-3 transition hover:bg-muted',
                                            rtMode === mode ? 'border-primary bg-primary/5' : 'border-border'
                                        )}
                                    >
                                        <RadioGroupItem value={mode} id={`rt-${mode}`} />
                                        <div>
                                            <p className="text-sm font-semibold">{rtModeCopy[mode].title}</p>
                                            <p className="text-xs text-muted-foreground">{rtModeCopy[mode].description}</p>
                                        </div>
                                    </label>
                                ))}
                            </RadioGroup>
                        </div>
                    </CardContent>
                </Card>

                {participantsWithMetrics.length === 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>まだ集計できるデータがありません</CardTitle>
                            <CardDescription>
                                本番実験を完了した参加者のデータが保存されると、ここでブロック単位の結果を確認できます。
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                テスト参加者で本番実験を完走し、管理者ページで「同期」されていることを確認してください。
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>対象参加者の選択</CardTitle>
                                <CardDescription>
                                    チェックした参加者を分析に含めます。1名で詳細、複数で比較ビューが表示されます。
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                    <label className="flex items-center gap-2 font-medium">
                                        <input
                                            ref={selectAllRef}
                                            type="checkbox"
                                            className="h-4 w-4 rounded border border-slate-300 text-primary focus-visible:ring-primary"
                                            checked={allSelected}
                                            onChange={handleToggleSelectAllParticipants}
                                        />
                                        一括選択
                                    </label>
                                    <span className="text-xs text-muted-foreground">
                                        {selectedParticipantIds.length ? `${selectedParticipantIds.length} 名選択中` : '分析したい参加者をチェックしてください'}
                                    </span>
                                </div>
                                <ScrollArea className="min-h-64 h-80 rounded-lg border">
                                    <div className="divide-y">
                                        {participantsWithMetrics.map(participant => {
                                            const isSelected = selectedParticipantIds.includes(participant.id);
                                            const hasStatic = participant.metrics.some(metric => metric.conditionType === 'static');
                                            const hasPersonalized = participant.metrics.some(metric => metric.conditionType === 'personalized');
                                            return (
                                                <label
                                                    key={participant.id}
                                                    htmlFor={`select-${participant.id}`}
                                                    className={cn(
                                                        'flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors cursor-pointer',
                                                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                                                    )}
                                                >
                                                    <div>
                                                        <p className="font-semibold">{participant.label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            登録日: {participant.createdAt.toLocaleDateString('ja-JP')}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex gap-1">
                                                            {hasStatic && <Badge variant="outline" className="text-[10px] uppercase">Static</Badge>}
                                                            {hasPersonalized && <Badge variant="outline" className="text-[10px] uppercase">Personalized</Badge>}
                                                        </div>
                                                        <input
                                                            id={`select-${participant.id}`}
                                                            type="checkbox"
                                                            className="h-4 w-4 rounded border-slate-300 text-primary focus-visible:ring-primary"
                                                            checked={isSelected}
                                                            onChange={() => toggleParticipantSelection(participant.id)}
                                                        />
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        {selectedParticipant ? (
                            <Card className="overflow-hidden">
                                <CardHeader className="space-y-2">
                                    <CardTitle>参加者別ブロック指標</CardTitle>
                                    <CardDescription>
                                        選択した参加者のブロックごとの正答率と反応時間を確認できます
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <p className="text-sm text-muted-foreground">対象参加者</p>
                                            <p className="text-2xl font-semibold">{selectedParticipant.label}</p>
                                            <p className="text-xs text-muted-foreground">
                                                初回登録: {selectedParticipant.createdAt.toLocaleDateString('ja-JP')}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <p className="text-sm text-muted-foreground">条件フィルター</p>
                                            <RadioGroup
                                                value={participantCondition}
                                                onValueChange={value => setParticipantCondition(value as ConditionFilter)}
                                                className="flex flex-col gap-2 sm:flex-row"
                                            >
                                                {(['all', 'static', 'personalized'] as ConditionFilter[]).map(option => (
                                                    <label
                                                        key={option}
                                                        className={cn(
                                                            'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted',
                                                            participantCondition === option ? 'border-primary bg-primary/5' : 'border-border'
                                                        )}
                                                    >
                                                        <RadioGroupItem value={option} id={`participant-${option}`} />
                                                        {conditionFilterCopy[option]}
                                                    </label>
                                                ))}
                                            </RadioGroup>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <StatCard
                                            label="平均正答率"
                                            value={participantSummary?.avgAccuracy != null ? `${participantSummary.avgAccuracy}%` : '—'}
                                            subLabel="選択中のブロックで算出"
                                        />
                                        <StatCard
                                            label="平均反応時間"
                                            value={participantSummary?.avgRt != null ? `${participantSummary.avgRt}ms` : '—'}
                                            subLabel={rtModeCopy[rtMode].title}
                                        />
                                    </div>

                                    <div className="flex justify-end">
                                        <Button variant="outline" size="sm" onClick={() => setShowDetailCharts(prev => !prev)}>
                                            {showDetailCharts ? 'チャートを隠す' : 'チャートを表示'}
                                        </Button>
                                    </div>
                                    {showDetailCharts && (
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <Sparkline
                                                label="正答率トレンド"
                                                unit="%"
                                                color="#16a34a"
                                                data={participantCharts.accuracy}
                                            />
                                            <Sparkline
                                                label="反応時間トレンド"
                                                unit="ms"
                                                color="#2563eb"
                                                data={participantCharts.rt}
                                            />
                                        </div>
                                    )}

                                    <Separator />

                                    {filteredParticipantMetrics.length ? (
                                        <ScrollArea className="h-[320px]">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>条件</TableHead>
                                                        <TableHead>ブロック</TableHead>
                                                        <TableHead>正答率</TableHead>
                                                        <TableHead>平均RT</TableHead>
                                                        <TableHead>完了日時</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredParticipantMetrics.map(metric => (
                                                        <TableRow key={`${metric.experimentId}-${metric.blockNumber}`}>
                                                            <TableCell>
                                                                <Badge variant="outline">{conditionDisplay[metric.conditionType]}</Badge>
                                                            </TableCell>
                                                            <TableCell>{metric.blockNumber}</TableCell>
                                                            <TableCell>
                                                                {typeof metric.accuracy === 'number' ? `${metric.accuracy}%` : '—'}
                                                            </TableCell>
                                                            <TableCell>{formatRtValue(getRtValue(metric, rtMode))}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {metric.completedAt
                                                                    ? metric.completedAt.toLocaleString('ja-JP', {
                                                                        month: '2-digit',
                                                                        day: '2-digit',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit',
                                                                    })
                                                                    : '—'}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </ScrollArea>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            選択された条件ではまだブロック結果がありません。
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardHeader>
                                    <CardTitle>対象を1名に絞ってください</CardTitle>
                                    <CardDescription>詳細なブロック推移を確認するには1名だけ選択します。</CardDescription>
                                </CardHeader>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="space-y-2">
                                <CardTitle>選択参加者の比較</CardTitle>
                                <CardDescription>
                                    複数選択すると条件ごとのブロック推移と前後半の平均を比較できます
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {hasMultipleSelection ? (
                                    <>
                                        <div className="grid gap-4 lg:grid-cols-2">
                                            <StatCard
                                                label="全体平均正答率"
                                                value={aggregatedSummary?.avgAccuracy != null ? `${aggregatedSummary.avgAccuracy}%` : '—'}
                                                subLabel={`フィルター: ${conditionFilterCopy[aggregateCondition]}`}
                                            />
                                            <StatCard
                                                label="全体平均RT"
                                                value={aggregatedSummary?.avgRt != null ? `${aggregatedSummary.avgRt}ms` : '—'}
                                                subLabel={rtModeCopy[rtMode].title}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <p className="text-sm text-muted-foreground">条件フィルター</p>
                                            <RadioGroup
                                                value={aggregateCondition}
                                                onValueChange={value => setAggregateCondition(value as ConditionFilter)}
                                                className="flex flex-col gap-2 sm:flex-row"
                                            >
                                                {(['all', 'static', 'personalized'] as ConditionFilter[]).map(option => (
                                                    <label
                                                        key={option}
                                                        className={cn(
                                                            'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted',
                                                            aggregateCondition === option ? 'border-primary bg-primary/5' : 'border-border'
                                                        )}
                                                    >
                                                        <RadioGroupItem value={option} id={`aggregate-${option}`} />
                                                        {conditionFilterCopy[option]}
                                                    </label>
                                                ))}
                                            </RadioGroup>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                            <span>{selectedParticipantIds.length} 名分のデータを集計中</span>
                                            <Button variant="outline" size="sm" onClick={() => setShowAggregateCharts(prev => !prev)}>
                                                {showAggregateCharts ? 'チャートを隠す' : 'チャートを表示'}
                                            </Button>
                                        </div>
                                        {showAggregateCharts && (
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Sparkline label="平均正答率（ブロック別）" unit="%" color="#16a34a" data={aggregatedRows.map(row => ({
                                                    x: row.blockNumber,
                                                    y: row.avgAccuracy,
                                                    label: `Block ${row.blockNumber}`,
                                                }))} />
                                                <Sparkline label="平均反応時間（ブロック別）" unit="ms" color="#2563eb" data={aggregatedRows.map(row => ({
                                                    x: row.blockNumber,
                                                    y: row.avgRt,
                                                    label: `Block ${row.blockNumber}`,
                                                }))} />
                                            </div>
                                        )}

                                        <Separator />

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold">ブロックごとの Static / Personalized</p>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>ブロック</TableHead>
                                                            <TableHead>Static 正答率</TableHead>
                                                            <TableHead>Static RT</TableHead>
                                                            <TableHead>Personalized 正答率</TableHead>
                                                            <TableHead>Personalized RT</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {conditionBlockRows.length ? (
                                                            conditionBlockRows.map(row => (
                                                                <TableRow key={row.blockNumber}>
                                                                    <TableCell>{row.blockNumber}</TableCell>
                                                                    <TableCell>{formatPercent(row.static.accuracy)}</TableCell>
                                                                    <TableCell>{formatRtValue(row.static.rt)}</TableCell>
                                                                    <TableCell>{formatPercent(row.personalized.accuracy)}</TableCell>
                                                                    <TableCell>{formatRtValue(row.personalized.rt)}</TableCell>
                                                                </TableRow>
                                                            ))
                                                        ) : (
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                                                                    比較に十分なブロックがまだありません。
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold">前半 vs 後半</p>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>条件</TableHead>
                                                            <TableHead>前半 正答率</TableHead>
                                                            <TableHead>後半 正答率</TableHead>
                                                            <TableHead>前半 RT</TableHead>
                                                            <TableHead>後半 RT</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {(['static', 'personalized'] as ConditionType[]).map(condition => (
                                                            <TableRow key={condition}>
                                                                <TableCell>{conditionDisplay[condition]}</TableCell>
                                                                <TableCell>{formatPercent(halfComparison[condition].firstHalfAccuracy)}</TableCell>
                                                                <TableCell>{formatPercent(halfComparison[condition].secondHalfAccuracy)}</TableCell>
                                                                <TableCell>{formatRtValue(halfComparison[condition].firstHalfRt)}</TableCell>
                                                                <TableCell>{formatRtValue(halfComparison[condition].secondHalfRt)}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        2名以上を選択すると比較データが表示されます。
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
}

function getRtValue(metric: BlockMetric, mode: RtMode): number | null {
    if (mode === 'correctOnly') {
        if (typeof metric.averageRtCorrectOnly === 'number') {
            return metric.averageRtCorrectOnly;
        }
        return metric.averageRt;
    }
    return metric.averageRt;
}

function formatPercent(value: number | null): string {
    return typeof value === 'number' ? `${value}%` : '—';
}

function formatRtValue(value: number | null): string {
    return typeof value === 'number' ? `${value}ms` : '—';
}

interface SparklineProps {
    label: string;
    unit: string;
    color: string;
    data: { x: number; y: number | null; label?: string }[];
}

function Sparkline({ label, unit, color, data }: SparklineProps) {
    const validPoints = data.filter(point => typeof point.y === 'number' && !Number.isNaN(point.y));
    if (!validPoints.length) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription>十分なデータがありません</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const minY = Math.min(...validPoints.map(point => point.y as number));
    const maxY = Math.max(...validPoints.map(point => point.y as number));
    const rangeY = maxY - minY || 1;

    const xValues = validPoints.map(point => point.x);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const rangeX = maxX - minX || 1;

    const padding = { top: 8, right: 8, bottom: 16, left: 14 };
    const chartWidth = 100 - padding.left - padding.right;
    const chartHeight = 100 - padding.top - padding.bottom;
    const xAxisY = padding.top + chartHeight;
    const yAxisX = padding.left;

    const getX = (value: number) => padding.left + ((value - minX) / rangeX) * chartWidth;
    const getY = (value: number) => padding.top + (chartHeight - ((value - minY) / rangeY) * chartHeight);

    const orderedPoints = data.filter(point => typeof point.y === 'number' && !Number.isNaN(point.y));
    const pathD = orderedPoints.map((point, index) => {
        const xCoord = getX(point.x);
        const yCoord = getY(point.y as number);
        return `${index === 0 ? 'M' : 'L'}${xCoord},${yCoord}`;
    }).join(' ');

    const avg = Math.round(validPoints.reduce((sum, point) => sum + (point.y as number), 0) / validPoints.length);

    const yTicks = Array.from({ length: 5 }, (_, idx) => {
        const value = minY + (rangeY * idx) / 4;
        return { value, y: getY(value) };
    });

    const uniqueXValues = Array.from(new Set(xValues)).sort((a, b) => a - b);
    const tickSlots = Math.min(4, uniqueXValues.length) || 1;
    const xTicks = Array.from({ length: tickSlots }, (_, idx) => {
        const targetIndex = Math.round(idx * (uniqueXValues.length - 1) / Math.max(1, tickSlots - 1));
        const value = uniqueXValues[targetIndex];
        return { value, x: getX(value) };
    });

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription>
                    平均 {avg}{unit} / 最小 {Math.round(minY)}{unit} / 最大 {Math.round(maxY)}{unit}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <svg viewBox="0 0 100 100" className="h-32 w-full text-muted-foreground">
                    <line x1={yAxisX} y1={padding.top} x2={yAxisX} y2={xAxisY} stroke="currentColor" strokeWidth={0.5} />
                    <line x1={yAxisX} y1={xAxisY} x2={padding.left + chartWidth} y2={xAxisY} stroke="currentColor" strokeWidth={0.5} />
                    {yTicks.map((tick, idx) => (
                        <g key={`y-${idx}`}>
                            <line
                                x1={yAxisX - 2}
                                y1={tick.y}
                                x2={padding.left + chartWidth}
                                y2={tick.y}
                                stroke="currentColor"
                                strokeWidth={0.2}
                                strokeOpacity={0.2}
                            />
                            <text x={2} y={tick.y + 2} fontSize="6" fill="currentColor">
                                {Math.round(tick.value)}
                            </text>
                        </g>
                    ))}
                    {xTicks.map((tick, idx) => (
                        <g key={`x-${idx}`}>
                            <line
                                x1={tick.x}
                                y1={xAxisY}
                                x2={tick.x}
                                y2={xAxisY + 3}
                                stroke="currentColor"
                                strokeWidth={0.4}
                            />
                            <text x={tick.x - 3} y={xAxisY + 10} fontSize="6" fill="currentColor">
                                {tick.value}
                            </text>
                        </g>
                    ))}
                    <path
                        d={pathD}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </CardContent>
        </Card>
    );
}

interface StatCardProps {
    label: string;
    value: string;
    subLabel?: string;
}

function StatCard({ label, value, subLabel }: StatCardProps) {
    return (
        <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
            {subLabel && <p className="text-xs text-muted-foreground mt-1">{subLabel}</p>}
        </div>
    );
}
