import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { getTemplateSrv, locationService } from '@grafana/runtime';
import { Icon, useTheme2 } from '@grafana/ui';
import { SimpleOptions } from 'types';
import { css } from '@emotion/css';
import { resolveJwtToken, withAuthTokenHeader } from '../utils/jwtToken';
import * as echarts from "echarts";
interface Props extends PanelProps<SimpleOptions> { }

const PLUGIN_ID = "dsknggrafana-deskoverplugin-panel";

type ChartConfig = {
  key: string;
  title: string;
  type?: "chart" | "html" | "widget";
  height?: number;
  option?: echarts.EChartsOption;
  endpoint?: ChartEndpoint;
  code?: string;
  html?: string;
  css?: string;
  js?: string;
};

type HtmlContent = {
  html: string;
  css?: string;
};

type WidgetApi = {
  mount?: (ctx: WidgetLifecycleContext) => void;
  update?: (ctx: WidgetLifecycleContext) => void;
  destroy?: (ctx: WidgetLifecycleContext) => void;
  html?: string;
  css?: string;
};

type WidgetExecutionResult = {
  html: string;
  css: string;
  api: WidgetApi | null;
};

type WidgetRuntime = {
  cacheKey: string;
  chartKey: string;
  root: HTMLDivElement;
  html: string;
  css: string;
  api: WidgetApi | null;
  state: Record<string, unknown>;
  payload: unknown;
  vars: Record<string, unknown>;
  cleanupFns: Array<() => void>;
};

type WidgetLifecycleContext = {
  root: HTMLDivElement;
  contentRoot: HTMLElement | null;
  data: unknown;
  vars: Record<string, unknown>;
  echarts: typeof echarts;
  state: Record<string, unknown>;
  cleanup: (fn: () => void) => void;
  grafana: {
    locationService: typeof locationService;
    scopedVars: Record<string, unknown>;
    replaceVariables: (value: string, format?: string) => string;
  };
  panel: {
    id?: number;
    pluginId: string;
    groupKey: string;
    chartKey: string;
    width: number;
    height: number;
  };
};

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

type AccordionConfig = {
  key: string;
  title: string;
  subtitle?: string;
  charts: ChartConfig[];
  pinned?: boolean;
};

type CategoryConfig = {
  key: string;
  title: string;
  accordionLayoutMode?: "vertical" | "horizontal";
  accordionColumns?: 1 | 2 | 3;
  sections: AccordionConfig[];
};

type PanelConfig = {
  categories: CategoryConfig[];
};

type ChartEndpoint = {
  refId?: string;
  url?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  useProxy?: boolean;
  proxyPath?: string;
};

type ChartEventHandler = (params: any) => void;
type ChartEventRegistry = Record<string, ChartEventHandler[]>;

const chartsConfigAbstencionismo: AccordionConfig[] = [
  {
    key: "abst_nacional",
    title: "Abstencionismo Nacional",
    subtitle: "Datos generales y tendencia",
    charts: [
      {
        key: "abst_line",
        title: "Tendencia nacional",
        height: 280,
        option: {
          grid: { left: 32, right: 16, top: 24, bottom: 28 },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: ["2006", "2012", "2018", "2024"] },
          yAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
          series: [{ type: "line", data: [38, 37, 36, 41], smooth: true, areaStyle: {} }],
        },
      },
      {
        key: "abst_scatter",
        title: "Relacion participacion",
        height: 280,
        option: {
          grid: { left: 36, right: 16, top: 24, bottom: 28 },
          tooltip: { trigger: "item" },
          xAxis: { type: "value", name: "Abstencionismo (%)" },
          yAxis: { type: "value", name: "Participacion (%)" },
          series: [
            {
              type: "scatter",
              data: [
                [35, 65],
                [40, 60],
                [45, 55],
                [50, 50],
                [55, 45],
              ],
            },
          ],
        },
      },
    ],
  },
  {
    key: "abst_partidos",
    title: "Abstencionismo por Partidos",
    subtitle: "Comparativos y composicion",
    charts: [
      {
        key: "abst_party_bar",
        title: "Comparativo por partido",
        height: 280,
        option: {
          grid: { left: 32, right: 16, top: 24, bottom: 28 },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: ["Partido Azul", "Partido Verde", "Partido Rojo", "Partido Naranja"] },
          yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
          series: [{ type: "bar", data: [42, 35, 47, 39], barMaxWidth: 36 }],
        },
      },
      {
        key: "abst_pie",
        title: "Composicion por partido",
        height: 280,
        option: {
          tooltip: { trigger: "item" },
          legend: { top: "bottom" },
          series: [
            {
              type: "pie",
              radius: ["40%", "70%"],
              data: [
                { name: "Partido Azul", value: 28 },
                { name: "Partido Verde", value: 22 },
                { name: "Partido Rojo", value: 30 },
                { name: "Partido Naranja", value: 20 },
              ],
              label: { formatter: "{b}: {d}%" },
            },
          ],
        },
      },
    ],
  },
];

const chartsConfigVotoDuroExtras: Record<string, ChartConfig[]> = {
  abst_nacional: [
    {
      key: "vd_line",
      title: "Tendencia voto duro",
      height: 280,
      option: {
        grid: { left: 32, right: 16, top: 24, bottom: 28 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: ["2006", "2012", "2018", "2024"] },
        yAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
        series: [{ type: "line", data: [28, 30, 33, 31], smooth: true, areaStyle: {} }],
      },
    },
    {
      key: "vd_bar",
      title: "Comparativo voto duro por region",
      height: 280,
      option: {
        grid: { left: 32, right: 16, top: 24, bottom: 28 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: ["Norte", "Centro", "Sur", "Occidente"] },
        yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
        series: [{ type: "bar", data: [29, 34, 27, 32], barMaxWidth: 36 }],
      },
    },
    {
      key: "vd_gauge",
      title: "Indice voto duro",
      height: 280,
      option: {
        series: [
          {
            type: "gauge",
            min: 0,
            max: 100,
            detail: { formatter: "{value}%" },
            data: [{ value: 31, name: "Voto duro" }],
          },
        ],
      },
    },
  ],
  abst_partidos: [
    {
      key: "vd_party_bar",
      title: "Fuerza voto duro por partido",
      height: 280,
      option: {
        grid: { left: 32, right: 16, top: 24, bottom: 28 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: ["Partido Azul", "Partido Verde", "Partido Rojo", "Partido Naranja"] },
        yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
        series: [{ type: "bar", data: [35, 25, 30, 20], barMaxWidth: 36 }],
      },
    },
    {
      key: "vd_pie",
      title: "Composicion voto duro",
      height: 280,
      option: {
        tooltip: { trigger: "item" },
        legend: { top: "bottom" },
        series: [
          {
            type: "pie",
            radius: ["40%", "70%"],
            data: [
              { name: "Partido Azul", value: 35 },
              { name: "Partido Verde", value: 25 },
              { name: "Partido Rojo", value: 30 },
              { name: "Partido Naranja", value: 10 },
            ],
            label: { formatter: "{b}: {d}%" },
          },
        ],
      },
    },
  ],
};

const chartsConfigVotoDuro: AccordionConfig[] = chartsConfigAbstencionismo.reduce<AccordionConfig[]>(
  (acc, group) => {
    const extraCharts = chartsConfigVotoDuroExtras[group.key] ?? [];
    if (extraCharts.length === 0) {
      return acc;
    }
    acc.push({
      key: `vd_${group.key}`,
      title: `Voto duro `,
      subtitle: "Analisis de voto duro",
      charts: extraCharts,
    });
    return acc;
  },
  []
);

const defaultPanelConfig: PanelConfig = {
  categories: [
    {
      key: "abstencionismo",
      title: "Abstencionismo",
      sections: chartsConfigAbstencionismo,
    },
    {
      key: "votoduro",
      title: "Voto duro",
      sections: chartsConfigVotoDuro,
    },
  ],
};

const getVarCalculo = (): string => {
  if (typeof window === "undefined") return "abstencionismo";
  const params = new URLSearchParams(window.location.search);
  return params.get("var-calculo") ?? "abstencionismo";
};

const normalizeCalculo = (value: string) => value.trim().toLowerCase();
const getThemeModeFromUrl = (search: string): "light" | "dark" | null => {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("theme") ?? params.get("var-theme");
    const normalized = raw?.trim().toLowerCase();
    if (normalized === "light" || normalized === "dark") {
      return normalized;
    }
    return null;
  } catch {
    return null;
  }
};

const withDarkChartText = (option: any): any => {
  const text = "#f3f4f6";
  const subtle = "rgba(243, 244, 246, 0.78)";
  const split = "rgba(243, 244, 246, 0.10)";

  const applyDarkText = (source: any): any => {
    const next: any = { ...(source ?? {}) };

    next.textStyle = { ...(next.textStyle ?? {}), color: next.textStyle?.color ?? text };
    if (next.title) {
      const titles = Array.isArray(next.title) ? next.title : [next.title];
      next.title = titles.map((t: any) => ({
        ...(t ?? {}),
        textStyle: { ...(t?.textStyle ?? {}), color: t?.textStyle?.color ?? text },
      }));
      if (!Array.isArray(source?.title)) next.title = next.title[0];
    }

    if (next.legend) {
      const legends = Array.isArray(next.legend) ? next.legend : [next.legend];
      next.legend = legends.map((l: any) => ({
        ...(l ?? {}),
        textStyle: { ...(l?.textStyle ?? {}), color: l?.textStyle?.color ?? subtle },
      }));
      if (!Array.isArray(source?.legend)) next.legend = next.legend[0];
    }

    const patchAxis = (axis: any) => ({
      ...(axis ?? {}),
      axisLabel: { ...(axis?.axisLabel ?? {}), color: axis?.axisLabel?.color ?? text },
      nameTextStyle: { ...(axis?.nameTextStyle ?? {}), color: axis?.nameTextStyle?.color ?? subtle },
      axisLine: {
        ...(axis?.axisLine ?? {}),
        lineStyle: { ...(axis?.axisLine?.lineStyle ?? {}), color: axis?.axisLine?.lineStyle?.color ?? subtle },
      },
      splitLine: {
        ...(axis?.splitLine ?? {}),
        lineStyle: { ...(axis?.splitLine?.lineStyle ?? {}), color: axis?.splitLine?.lineStyle?.color ?? split },
      },
    });

    if (next.xAxis) {
      next.xAxis = Array.isArray(next.xAxis) ? next.xAxis.map(patchAxis) : patchAxis(next.xAxis);
    }
    if (next.yAxis) {
      next.yAxis = Array.isArray(next.yAxis) ? next.yAxis.map(patchAxis) : patchAxis(next.yAxis);
    }

    if (next.series) {
      const series = Array.isArray(next.series) ? next.series : [next.series];
      next.series = series.map((s: any) => ({
        ...(s ?? {}),
        label: { ...(s?.label ?? {}), color: s?.label?.color ?? text },
        endLabel: { ...(s?.endLabel ?? {}), color: s?.endLabel?.color ?? text },
      }));
      if (!Array.isArray(source?.series)) next.series = next.series[0];
    }

    next.tooltip = {
      ...(next.tooltip ?? {}),
      textStyle: { ...(next.tooltip?.textStyle ?? {}), color: next.tooltip?.textStyle?.color ?? text },
    };

    return next;
  };

  const next = applyDarkText(option);
  if (option?.baseOption) {
    next.baseOption = applyDarkText(option.baseOption);
  }
  if (Array.isArray(option?.options)) {
    next.options = option.options.map(applyDarkText);
  }

  return next;
};

type ParsedConfig = { config: PanelConfig | null; error: string | null };

const normalizeEndpoint = (raw?: any): ChartEndpoint | undefined => {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    return { refId: raw };
  }
  const refId = raw.refId ?? raw.query ?? raw.queryRefId ?? raw.consulta ?? raw.letra ?? raw.id;
  const url = raw.url ?? raw.endpoint ?? raw.puntoFinal ?? raw.ruta;
  const useProxyRaw = raw.useProxy ?? raw.usarProxy ?? raw.proxy;
  const useProxy =
    typeof useProxyRaw === "string" ? useProxyRaw.toLowerCase() === "true" : Boolean(useProxyRaw);
  const proxyPath = raw.proxyPath ?? raw.rutaProxy ?? raw.proxyId ?? raw.proxyPathId;
  if (!refId && !url) return undefined;
  return {
    refId,
    url,
    method: raw.method ?? raw.metodo,
    headers: raw.headers ?? raw.encabezados,
    body: raw.body ?? raw.cuerpo,
    useProxy,
    proxyPath,
  };
};

const payloadToEditorDataset = (payload: unknown): any => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, any>;
    if (record.dataset) return record.dataset;
    if (record.source) return { source: record.source };
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, any>;
      if (nested.dataset) return nested.dataset;
      if (nested.source) return { source: nested.source };
    }
    if (Array.isArray(record.data)) return { source: record.data };
  }
  if (Array.isArray(payload)) return { source: payload };
  return { source: [] };
};

const payloadToEditorSeries = (payload: unknown): any[] => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, any>;
    if (Array.isArray(record.series)) return record.series;
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, any>;
      if (Array.isArray(nested.series)) return nested.series;
    }
  }
  return [];
};

const slugPart = (value: any): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
};

const safeKey = (rawKey: any, fallbackPrefix: string, index: number, title?: any): string => {
  const keyFromRaw = typeof rawKey === "string" ? rawKey.trim() : "";
  if (keyFromRaw) return keyFromRaw;
  const titleSlug = slugPart(title);
  return titleSlug ? `${fallbackPrefix}_${titleSlug}_${index}` : `${fallbackPrefix}_${index}`;
};

const normalizeChart = (raw: any, chartIndex: number, sectionKey: string): ChartConfig => {
  const title = raw.title ?? raw.titulo ?? "";
  const key = safeKey(raw.key ?? raw.clave, `${sectionKey}_chart`, chartIndex, title);
  const typeRaw = String(
    raw.type ?? raw.tipo ?? raw.componentType ?? raw.componente ?? raw.component ?? "chart"
  )
    .trim()
    .toLowerCase();
  const normalizedType =
    typeRaw === "widget" || typeRaw === "interactive" || typeRaw === "html-widget"
      ? "widget"
      : typeRaw === "html" || typeRaw === "table" || typeRaw === "tabla"
        ? "html"
        : "chart";
  return {
    key,
    title,
    type: normalizedType,
    height: raw.height ?? raw.altura,
    option: raw.option ?? raw.opcion,
    endpoint: normalizeEndpoint(raw.endpoint ?? raw.puntoFinal ?? raw.endpointConfig ?? raw.conexion ?? raw.refId),
    code: raw.code ?? raw.codigo ?? raw.funcion,
    html: raw.html ?? raw.contenidoHtml ?? raw.template ?? raw.plantilla ?? "",
    css: raw.css ?? raw.estilos ?? "",
    js: raw.js ?? raw.script ?? "",
  };
};

const normalizeSection = (raw: any, sectionIndex: number, categoryKey: string): AccordionConfig => {
  const chartsRaw = raw.charts ?? raw.graficas ?? raw.graficos ?? [];
  const title = raw.title ?? raw.titulo ?? "";
  const key = safeKey(raw.key ?? raw.clave, `${categoryKey}_section`, sectionIndex, title);
  return {
    key,
    title,
    subtitle: raw.subtitle ?? raw.subtitulo,
    charts: Array.isArray(chartsRaw)
      ? chartsRaw.map((chart: any, chartIndex: number) => normalizeChart(chart, chartIndex, key))
      : [],
    pinned: Boolean(raw.pinned ?? raw.fijado),
  };
};

const normalizeAccordionLayout = (raw: any): { mode: "vertical" | "horizontal"; columns: 1 | 2 | 3 } => {
  const source = raw?.accordionLayout ?? raw?.layoutAcordeones ?? raw?.acordeones ?? raw?.layout ?? {};
  const modeRaw =
    source?.mode ??
    source?.modo ??
    raw?.accordionLayoutMode ??
    raw?.modoAcordeones ??
    raw?.accordionMode ??
    raw?.layoutMode;
  const normalizedMode = typeof modeRaw === "string" && modeRaw.trim().toLowerCase().startsWith("h")
    ? "horizontal"
    : "vertical";
  const columnsRaw =
    source?.columns ??
    source?.columnas ??
    raw?.accordionColumns ??
    raw?.columnasAcordeones ??
    raw?.layoutColumns;
  const parsedColumns = Number.parseInt(String(columnsRaw ?? "1"), 10);
  const clampedColumns = Number.isFinite(parsedColumns) ? Math.max(1, Math.min(3, parsedColumns)) : 1;
  const columns = (normalizedMode === "horizontal" ? clampedColumns : 1) as 1 | 2 | 3;
  return { mode: normalizedMode, columns };
};

const normalizeCategory = (raw: any, categoryIndex: number): CategoryConfig => {
  const sectionsRaw = raw.sections ?? raw.secciones ?? [];
  const title = raw.title ?? raw.titulo ?? "";
  const key = safeKey(raw.key ?? raw.clave, "category", categoryIndex, title);
  const accordionLayout = normalizeAccordionLayout(raw);
  return {
    key,
    title,
    accordionLayoutMode: accordionLayout.mode,
    accordionColumns: accordionLayout.columns,
    sections: Array.isArray(sectionsRaw)
      ? sectionsRaw.map((section: any, sectionIndex: number) => normalizeSection(section, sectionIndex, key))
      : [],
  };
};

const normalizeConfig = (parsed: any): PanelConfig | null => {
  const categoriesRaw = Array.isArray(parsed)
    ? parsed
    : parsed?.categories ?? parsed?.categorias;
  if (!Array.isArray(categoriesRaw)) return null;
  return { categories: categoriesRaw.map((category: any, categoryIndex: number) => normalizeCategory(category, categoryIndex)) };
};

const replaceVars = (value: string, scopedVars?: Record<string, any>, format?: string) => {
  return getTemplateSrv().replace(value, scopedVars, format);
};

const normalizeJsonValue = (value: any): any => {
  if (Array.isArray(value)) {
    const next = value.map((item) => normalizeJsonValue(item));
    if (next.length === 1 && next[0] === "") {
      return [];
    }
    return next;
  }
  if (value && typeof value === "object") {
    const next: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      next[key] = normalizeJsonValue(val);
    });
    return next;
  }
  return value;
};

const deepReplace = (value: any, scopedVars?: Record<string, any>): any => {
  if (typeof value === "string") {
    // 1. Detectamos TU bandera: ¿El usuario escribió explícitamente :json} ?
    const isJsonFlagged = value.includes(":json}");

    // 2. Dejamos que Grafana interpole la variable (ej. convierte ${Partidos:json} a '["pvem","pt"]')
    const replaced = replaceVars(value, scopedVars);

    // 3. Si detectamos la bandera, forzamos su conversión a un Arreglo/Objeto real
    if (isJsonFlagged) {
      try {
        return JSON.parse(replaced); // Convierte el string mágico en un arreglo puro de Javascript
      } catch (e) {
        console.error("Error al convertir la variable con bandera :json", replaced);
        return replaced; // Fallback por si la variable estaba vacía o mal formada
      }
    }

    // Si no tiene la bandera, se queda como texto normal
    return replaced;
  }
  
  if (Array.isArray(value)) {
    return value.map((item) => deepReplace(item, scopedVars));
  }
  
  if (value && typeof value === "object") {
    const next: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      next[key] = deepReplace(val, scopedVars);
    });
    return next;
  }
  
  return value;
};

const parsePanelConfig = (raw?: string): ParsedConfig => {
  if (!raw) return { config: null, error: null };
  try {
    const parsed = JSON.parse(raw);
    const config = normalizeConfig(parsed);
    if (!config) {
      return { config: null, error: 'El JSON debe incluir "categories" o "categorias" como arreglo.' };
    }
    return { config, error: null };
  } catch {
    return { config: null, error: 'JSON invalido. Verifica comillas, comas y llaves.' };
  }
};

const extractConfigCandidate = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object") return raw;

  const asRecord = raw as Record<string, any>;
  if (Array.isArray(asRecord.categories) || Array.isArray(asRecord.categorias)) {
    return asRecord;
  }

  const directConfig = asRecord.json ?? asRecord.configJson ?? asRecord.config ?? asRecord.panelConfig;
  if (directConfig !== undefined) {
    return directConfig;
  }

  const nestedData = asRecord.data;
  if (nestedData && typeof nestedData === "object") {
    const nestedRecord = nestedData as Record<string, any>;
    if (Array.isArray(nestedRecord.categories) || Array.isArray(nestedRecord.categorias)) {
      return nestedRecord;
    }
    const nestedConfig =
      nestedRecord.json ?? nestedRecord.configJson ?? nestedRecord.config ?? nestedRecord.panelConfig;
    if (nestedConfig !== undefined) {
      return nestedConfig;
    }
  }

  return raw;
};

const parsePanelConfigUnknown = (raw: unknown): ParsedConfig => {
  const candidate = extractConfigCandidate(raw);

  if (typeof candidate === "string") {
    try {
      const parsed = JSON.parse(candidate);
      return parsePanelConfigUnknown(parsed);
    } catch {
      return parsePanelConfig(candidate);
    }
  }

  if (candidate !== raw) {
    return parsePanelConfigUnknown(candidate);
  }

  if (typeof raw === "string") {
    return parsePanelConfig(raw);
  }
  const config = normalizeConfig(raw);
  if (!config) {
    return { config: null, error: 'El endpoint debe responder un JSON con "categories" o "categorias" (arreglo).' };
  }
  return { config, error: null };
};

export const SimplePanel: React.FC<Props> = ({ options, data, width, height, fieldConfig, id }) => {
  const grafanaTheme = useTheme2();
  const [calculo, setCalculo] = useState<string>(() => getVarCalculo());
  const [urlSearch, setUrlSearch] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.location.search
  );
  const themeMode = useMemo(() => getThemeModeFromUrl(urlSearch), [urlSearch]);
  const isLightTheme = themeMode ? themeMode === "light" : grafanaTheme.isLight;
  const ui = useMemo(
    () =>
      isLightTheme
        ? {
            wrapperBgStart: "rgba(235, 241, 247, 0.75)",
            wrapperBgEnd: "rgba(255, 255, 255, 0.9)",
            toolbarBg: "rgba(255, 255, 255, 0.85)",
            toolbarBorder: "rgba(31, 45, 61, 0.12)",
            toolbarShadow: "rgba(18, 38, 63, 0.06)",
            textPrimary: "#1f2d3d",
            chipActiveBorder: "rgb(45, 49, 59)",
            chipActiveBg: "rgb(45, 49, 59)",
            chipActiveText: "#ffffff",
            chipBorder: "rgba(31, 45, 61, 0.2)",
            chipBg: "#ffffff",
            chipText: "#1f2d3d",
            infoBg: "rgba(25, 90, 160, 0.1)",
            infoBorder: "rgba(25, 90, 160, 0.28)",
            infoText: "#1d4f82",
            cardBorder: "rgba(35, 55, 90, 0.12)",
            cardBg: "#ffffff",
            cardShadow1: "rgba(18, 38, 63, 0.08)",
            cardShadow2: "rgba(18, 38, 63, 0.06)",
            summaryBg: "rgb(45, 49, 59)",
            summaryHoverBg: "rgb(15, 23, 42)",
            summaryText: "#ffffff",
            summaryText2: "#000",
            summaryMetaText: "rgba(255, 255, 255, 0.8)",
            summaryChevronBg: "#ffffff",
            summaryChevronBorder: "#ffffff",
            chipXActiveBg: "rgba(255, 255, 255, 0.2)",
            chipXBg: "rgba(31, 45, 61, 0.12)",
            overlayBg: "rgba(240, 245, 250, 0.72)",
            loaderInk: "rgba(31, 45, 61, 0.8)",
            loaderWord: "rgba(31, 45, 61, 0.92)",
            loaderDot: "#1f2d3d",
          }
        : {
            wrapperBgStart: "rgba(28, 31, 36, 0.92)",
            wrapperBgEnd: "rgba(18, 20, 24, 0.98)",
            toolbarBg: "rgba(33, 36, 42, 0.9)",
            toolbarBorder: "rgba(229, 231, 235, 0.16)",
            toolbarShadow: "rgba(0, 0, 0, 0.45)",
            textPrimary: "#f3f4f6",
            chipActiveBorder: "rgb(71, 85, 105)",
            chipActiveBg: "rgb(71, 85, 105)",
            chipActiveText: "#ffffff",
            chipBorder: "rgba(229, 231, 235, 0.26)",
            chipBg: "rgba(42, 46, 54, 0.95)",
            chipText: "#f3f4f6",
            infoBg: "rgba(75, 85, 99, 0.22)",
            infoBorder: "rgba(229, 231, 235, 0.24)",
            infoText: "#f9fafb",
            cardBorder: "rgba(229, 231, 235, 0.16)",
            cardBg: "#1f232b",
            cardShadow1: "rgba(0, 0, 0, 0.52)",
            cardShadow2: "rgba(0, 0, 0, 0.34)",
            summaryBg: "rgb(71, 85, 105)",
            summaryHoverBg: "rgb(51, 65, 85)",
            summaryText: "#ffffff",
            summaryText2: "#000",
            summaryMetaText: "rgba(255, 255, 255, 0.8)",
            summaryChevronBg: "#ffffff",
            summaryChevronBorder: "#ffffff",
            chipXActiveBg: "rgba(17, 24, 39, 0.35)",
            chipXBg: "rgba(229, 231, 235, 0.20)",
            overlayBg: "rgba(22, 25, 30, 0.74)",
            loaderInk: "rgba(243, 244, 246, 0.92)",
            loaderWord: "rgba(249, 250, 251, 0.97)",
            loaderDot: "#f3f4f6",
          },
    [grafanaTheme, isLightTheme]
  );
  const effectiveScopedVars = useMemo(
    () => data?.request?.scopedVars ?? {},
    [data?.request?.scopedVars]
  );
  const jwtToken = useMemo(
    () => resolveJwtToken({ scopedVars: effectiveScopedVars, search: urlSearch }),
    [effectiveScopedVars, urlSearch]
  );
  const scopedVarsKey = useMemo(() => {
    try {
      return JSON.stringify(effectiveScopedVars);
    } catch {
      return "";
    }
  }, [effectiveScopedVars]);
  const varsFingerprint = `${scopedVarsKey}|${urlSearch}`;
  const [stabilizedVarsFingerprint, setStabilizedVarsFingerprint] = useState<string>(varsFingerprint);
  const isWaitingVars = varsFingerprint !== stabilizedVarsFingerprint;
  const localParsedConfig = useMemo(() => parsePanelConfig(options?.configJson), [options?.configJson]);
  const [remotePanelConfig, setRemotePanelConfig] = useState<PanelConfig | null>(null);
  const [remoteConfigError, setRemoteConfigError] = useState<string | null>(null);
  const [isRemoteConfigLoading, setIsRemoteConfigLoading] = useState(false);
  const [loadingCharts, setLoadingCharts] = useState<Record<string, boolean>>({});
  const configEndpoint = (options?.configJsonEndpoint ?? "").trim();
  const preferRemoteConfig = Boolean(configEndpoint);
  const panelConfig = useMemo<PanelConfig>(() => {
    if (preferRemoteConfig) {
      return remotePanelConfig ?? localParsedConfig.config ?? defaultPanelConfig;
    }
    return localParsedConfig.config ?? remotePanelConfig ?? defaultPanelConfig;
  }, [localParsedConfig.config, preferRemoteConfig, remotePanelConfig]);
  const configError = useMemo(() => {
    if (remotePanelConfig) return null;
    if (localParsedConfig.error) return localParsedConfig.error;
    return remoteConfigError;
  }, [localParsedConfig.error, remoteConfigError, remotePanelConfig]);
  const categories = panelConfig.categories ?? [];
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [sectionOrderByCategory, setSectionOrderByCategory] = useState<Record<string, string[]>>({});
  const [chartErrors, setChartErrors] = useState<Record<string, string>>({});
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [activeCharts, setActiveCharts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    return initial;
  });
  const [pinnedSections] = useState<Set<string>>(() => new Set());
  const [hiddenCharts, setHiddenCharts] = useState<Record<string, Set<string>>>(() => ({}));
  const [draggedSectionKey, setDraggedSectionKey] = useState<string | null>(null);
  const [dragOverSectionKey, setDragOverSectionKey] = useState<string | null>(null);

  const chartInstancesRef = useRef<Record<string, echarts.ECharts | null>>({});
  const domRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const optionCacheRef = useRef<Record<string, echarts.EChartsOption | null>>({});
  const inFlightRef = useRef<Record<string, Promise<echarts.EChartsOption | null> | null>>({});
  const chartEventHandlersRef = useRef<Record<string, ChartEventRegistry>>({});
  const attachedChartEventsRef = useRef<Record<string, Set<string>>>({});
  const htmlCacheRef = useRef<Record<string, HtmlContent | null>>({});
  const htmlInFlightRef = useRef<Record<string, Promise<HtmlContent | null> | null>>({});
  const widgetDomRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const widgetRuntimeRef = useRef<Record<string, WidgetRuntime | null>>({});
  const errorCacheRef = useRef<Record<string, number>>({});
  const scopedVarsVersionRef = useRef(0);
  const [htmlContents, setHtmlContents] = useState<Record<string, HtmlContent>>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sectionContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousSectionRectsRef = useRef<Record<string, DOMRect>>({});
  const contextRefs = useRef({ effectiveScopedVars, width, height, id });

  useEffect(() => {
    contextRefs.current = { effectiveScopedVars, width, height, id };
  }, [effectiveScopedVars, width, height, id]);

  const destroyWidgetRuntimeInternal = useCallback(
    (groupKey: string, clearMarkup = false) => {
      const runtime = widgetRuntimeRef.current[groupKey];
      if (!runtime) {
        return;
      }

      const context: WidgetLifecycleContext = {
        root: runtime.root,
        contentRoot: runtime.root.querySelector("[data-dsk-widget-content]"),
        data: runtime.payload,
        vars: runtime.vars,
        echarts,
        state: runtime.state,
        cleanup: () => undefined,
        grafana: {
          locationService,
          scopedVars: effectiveScopedVars,
          replaceVariables: (value: string, format?: string) => replaceVars(value, effectiveScopedVars, format),
        },
        panel: {
          id,
          pluginId: PLUGIN_ID,
          groupKey,
          chartKey: runtime.chartKey,
          width,
          height,
        },
      };

      if (runtime.api?.destroy) {
        try {
          runtime.api.destroy(context);
        } catch (error) {
          console.error("Error destruyendo widget", error);
        }
      }

      runtime.cleanupFns.slice().reverse().forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.error("Error ejecutando limpieza de widget", error);
        }
      });

      const nodes = [runtime.root, ...Array.from(runtime.root.querySelectorAll<HTMLElement>("*"))];
      nodes.forEach((node) => {
        const instance = echarts.getInstanceByDom(node as HTMLDivElement);
        if (instance && !instance.isDisposed?.()) {
          instance.dispose();
        }
      });

      if (clearMarkup) {
        runtime.root.innerHTML = "";
      }
      widgetRuntimeRef.current[groupKey] = null;
    },
    //[effectiveScopedVars, height, id, width]
    []
  );

  useEffect(() => {
    const runtimeKeys = Object.keys(widgetRuntimeRef.current);
    return () => {
      Object.values(chartInstancesRef.current).forEach((chart) => chart?.dispose());
      runtimeKeys.forEach((groupKey) => destroyWidgetRuntimeInternal(groupKey, false));
    };
  }, [destroyWidgetRuntimeInternal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateFromUrl = () => {
      const next = getVarCalculo();
      setCalculo((prev) => (prev === next ? prev : next));
      const nextSearch = window.location.search;
      setUrlSearch((prev) => (prev === nextSearch ? prev : nextSearch));
    };

    updateFromUrl();
    window.addEventListener("popstate", updateFromUrl);
    window.addEventListener("hashchange", updateFromUrl);
    const timer = window.setInterval(updateFromUrl, 1000);

    return () => {
      window.removeEventListener("popstate", updateFromUrl);
      window.removeEventListener("hashchange", updateFromUrl);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStabilizedVarsFingerprint(varsFingerprint);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [varsFingerprint]);

  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategory("");
      return;
    }
    const normalized = normalizeCalculo(calculo);
    const fromUrl = categories.find((category) => normalizeCalculo(category.key) === normalized);
    const fallback = categories[0].key;
    setSelectedCategory((prev) => {
      if (prev && categories.some((category) => category.key === prev)) return prev;
      return fromUrl?.key ?? fallback;
    });
  }, [calculo, categories]);

  const selectedCategoryConfig = useMemo(
    () => categories.find((item) => item.key === selectedCategory) ?? categories[0],
    [categories, selectedCategory]
  );
  const selectedCategoryKey = selectedCategoryConfig?.key ?? "";
  const baseSections = selectedCategoryConfig?.sections ?? [];
  const sections = useMemo(() => {
    const preferredOrder = sectionOrderByCategory[selectedCategoryKey] ?? [];
    if (preferredOrder.length === 0) {
      return baseSections;
    }

    const sectionsMap = new Map(baseSections.map((section) => [section.key, section]));
    const orderedSections = preferredOrder
      .map((sectionKey) => sectionsMap.get(sectionKey))
      .filter((section): section is AccordionConfig => Boolean(section));
    const missingSections = baseSections.filter((section) => !preferredOrder.includes(section.key));
    return [...orderedSections, ...missingSections];
  }, [baseSections, sectionOrderByCategory, selectedCategoryKey]);
  const accordionLayoutMode = selectedCategoryConfig?.accordionLayoutMode ?? "vertical";
  const accordionColumns = selectedCategoryConfig?.accordionColumns ?? 1;

  useEffect(() => {
    if (!selectedCategoryKey) {
      return;
    }

    const availableKeys = baseSections.map((section) => section.key);
    setSectionOrderByCategory((prev) => {
      const existingOrder = prev[selectedCategoryKey] ?? [];
      const nextOrder = [
        ...existingOrder.filter((sectionKey) => availableKeys.includes(sectionKey)),
        ...availableKeys.filter((sectionKey) => !existingOrder.includes(sectionKey)),
      ];

      if (
        existingOrder.length === nextOrder.length &&
        existingOrder.every((sectionKey, index) => sectionKey === nextOrder[index])
      ) {
        return prev;
      }

      return { ...prev, [selectedCategoryKey]: nextOrder };
    });
  }, [baseSections, selectedCategoryKey]);

  useLayoutEffect(() => {
    const nextRects: Record<string, DOMRect> = {};

    sections.forEach((section) => {
      const node = sectionContainerRefs.current[section.key];
      if (!node) {
        return;
      }

      nextRects[section.key] = node.getBoundingClientRect();
    });

    sections.forEach((section) => {
      const node = sectionContainerRefs.current[section.key];
      const previousRect = previousSectionRectsRef.current[section.key];
      const nextRect = nextRects[section.key];

      if (!node || !previousRect || !nextRect) {
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        return;
      }

      node.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px) scale(0.985)`,
            filter: "brightness(1.05)",
          },
          {
            transform: "translate(0, 0) scale(1)",
            filter: "brightness(1)",
          },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );
    });

    previousSectionRectsRef.current = nextRects;
  }, [sections]);

  useEffect(() => {
    Object.values(chartInstancesRef.current).forEach((chart) => chart?.dispose());
    chartInstancesRef.current = {};
    attachedChartEventsRef.current = {};
    domRefs.current = {};
    // Las secciones también cambian al reordenarse o al actualizar estado visual.
    // No desmontamos los widgets que siguen presentes: hacerlo vuelve a aplicar
    // su HTML y dispara `mount` repetidamente (por ejemplo, tablas paginadas).
    const currentSectionKeys = new Set(sections.map((section) => section.key));
    Object.keys(widgetRuntimeRef.current).forEach((groupKey) => {
      if (!currentSectionKeys.has(groupKey)) {
        destroyWidgetRuntimeInternal(groupKey, true);
        delete widgetDomRefs.current[groupKey];
      }
    });
    setLoadingCharts({});
    setOpenKeys((prev) => {
      const next = new Set(prev);
      const hasAnyCurrentOpen = sections.some((group) => next.has(group.key));
      if (!hasAnyCurrentOpen && sections[0]?.key) {
        next.add(sections[0].key);
      }
      return next;
    });
    setActiveCharts((prev) => {
      const next = { ...prev };
      sections.forEach((group) => {
        // Solo establecemos el valor inicial si la sección no tiene un estado previo.
        // Eliminamos la validación de existencia aquí para evitar reseteos 
        // cuando la configuración se recarga tras interactuar con otros paneles.
        if (next[group.key] === undefined) {
          next[group.key] = group.charts[0]?.key ?? "";
        }
      });
      return next;
    });
    setHiddenCharts((prev) => {
      const next = { ...prev };
      sections.forEach((group) => {
        const previousHidden = prev[group.key];
        if (!previousHidden?.size) {
          return;
        }
        const validChartKeys = new Set(group.charts.map((chart) => chart.key));
        const filteredHidden = new Set([...previousHidden].filter((key) => validChartKeys.has(key)));
        if (filteredHidden.size > 0) {
          next[group.key] = filteredHidden;
        }
      });
      return next;
    });
  }, [destroyWidgetRuntimeInternal, sections]);

  useEffect(() => {
    optionCacheRef.current = {};
    inFlightRef.current = {};
    chartEventHandlersRef.current = {};
    attachedChartEventsRef.current = {};
    htmlCacheRef.current = {};
    htmlInFlightRef.current = {};
    Object.keys(widgetRuntimeRef.current).forEach((groupKey) => destroyWidgetRuntimeInternal(groupKey, false));
    setHtmlContents({});
  }, [destroyWidgetRuntimeInternal, panelConfig]);

  useEffect(() => {
    scopedVarsVersionRef.current += 1;
    optionCacheRef.current = {};
    inFlightRef.current = {};
    chartEventHandlersRef.current = {};
    attachedChartEventsRef.current = {};
    htmlCacheRef.current = {};
    htmlInFlightRef.current = {};
    //Object.keys(widgetRuntimeRef.current).forEach((groupKey) => destroyWidgetRuntimeInternal(groupKey, false));
    setHtmlContents({});
  }, [destroyWidgetRuntimeInternal, stabilizedVarsFingerprint]);

  useEffect(() => {
    let isCancelled = false;
    const loadRemoteConfig = async () => {
      if (!configEndpoint) {
        setRemotePanelConfig(null);
        setRemoteConfigError(null);
        setIsRemoteConfigLoading(false);
        return;
      }

      try {
        setIsRemoteConfigLoading(true);
        setRemoteConfigError(null);
        const endpointUrl = replaceVars(configEndpoint, effectiveScopedVars);
        const response = await fetch(endpointUrl, {
          headers: withAuthTokenHeader(undefined, jwtToken),
        });
        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status} al consultar ${endpointUrl}`);
        }
        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json") ? await response.json() : await response.text();
        const parsed = parsePanelConfigUnknown(payload);
        if (parsed.error || !parsed.config) {
          throw new Error(parsed.error ?? "La configuracion remota no es valida.");
        }
        if (isCancelled) return;
        setRemotePanelConfig(parsed.config);
      } catch (error) {
        if (isCancelled) return;
        const message =
          error instanceof Error ? error.message : "No se pudo cargar la configuracion remota del panel.";
        setRemotePanelConfig(null);
        setRemoteConfigError(message);
      } finally {
        if (!isCancelled) {
          setIsRemoteConfigLoading(false);
        }
      }
    };

    loadRemoteConfig();
    return () => {
      isCancelled = true;
    };
  }, [configEndpoint, effectiveScopedVars, jwtToken, stabilizedVarsFingerprint]);

  const wrapperClass = useMemo(
    () => css`
      @keyframes dsk-blink {
        0%,
        100% {
          opacity: 0.35;
          transform: translateY(0);
        }
        50% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }
      @keyframes dsk-loader-pulse {
        0%,
        100% {
          opacity: 0.55;
        }
        50% {
          opacity: 1;
        }
      }
      width: ${width}px;
      height: ${height}px;
      box-sizing: border-box;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      isolation: isolate;
      background: linear-gradient(135deg, ${ui.wrapperBgStart}, ${ui.wrapperBgEnd});
      border-radius: 14px;
      /* Forzamos el recorte estricto y el aislamiento de capas */
      contain: layout paint;
      overflow-y: auto !important;

      &.panel-is-transitioning {
        view-transition-name: dsk-wrapper-${id};
      }
    `,
    [height, ui.wrapperBgEnd, ui.wrapperBgStart, width, id]
  );

  const onToggleCategory = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  const createChartCodeContext = useCallback(
    (
      groupKey: string,
      payload: unknown,
      vars: Record<string, unknown>,
      registerEvent: (eventName: string, handler: ChartEventHandler) => void,
      clearEvent: (eventName?: string) => void
    ) => {
      const chartProxy = {
        on: registerEvent,
        off: clearEvent,
        get _model() {
          return (chartInstancesRef.current[groupKey] as any)?._model;
        },
        getOption: () => chartInstancesRef.current[groupKey]?.getOption(),
        resize: () => chartInstancesRef.current[groupKey]?.resize(),
        dispatchAction: (action: any) => chartInstancesRef.current[groupKey]?.dispatchAction(action),
        setOption: (...args: any[]) => (chartInstancesRef.current[groupKey] as any)?.setOption(...args),
      };

      return {
        data: payload,
        echarts,
        vars,
        editor: {
          dataset: payloadToEditorDataset(payload),
          series: payloadToEditorSeries(payload),
        },
        grafana: {
          locationService,
          scopedVars: effectiveScopedVars,
          replaceVariables: (value: string, format?: string) => replaceVars(value, effectiveScopedVars, format),
        },
        panel: {
          chart: chartProxy,
        },
      };
    },
    [effectiveScopedVars]
  );

  const ensureChart = useCallback(
    (groupKey: string, cacheKey: string, option: echarts.EChartsOption) => {
      const el = domRefs.current[groupKey];
      if (!el) return;

      const existingByDom = echarts.getInstanceByDom(el);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) {
        requestAnimationFrame(() => ensureChart(groupKey, cacheKey, option));
        return;
      }

      let chart = chartInstancesRef.current[groupKey];
      if (existingByDom) {
        Object.entries(chartInstancesRef.current).forEach(([key, value]) => {
          if (value === existingByDom) {
            chartInstancesRef.current[key] = null;
          }
        });
      }
      if (existingByDom && existingByDom !== chart) {
        existingByDom.dispose();
      }
      if (!chart || chart.isDisposed?.() || chart.getDom?.() !== el) {
        chart = echarts.init(el);
        chartInstancesRef.current[groupKey] = chart;
      }
      const optionWithMotion: any = { ...(option as any) };
      if (optionWithMotion.animationDuration == null) optionWithMotion.animationDuration = 420;
      if (optionWithMotion.animationDurationUpdate == null) optionWithMotion.animationDurationUpdate = 520;
      if (optionWithMotion.animationEasing == null) optionWithMotion.animationEasing = "cubicOut";
      if (optionWithMotion.animationEasingUpdate == null) optionWithMotion.animationEasingUpdate = "quarticOut";
      const finalOption = isLightTheme ? optionWithMotion : withDarkChartText(optionWithMotion);
      chart.setOption(finalOption, { notMerge: true, lazyUpdate: true });

      const previousEvents = attachedChartEventsRef.current[groupKey] ?? new Set<string>();
      previousEvents.forEach((eventName) => (chart as any).off(eventName));

      const nextEvents = new Set<string>();
      const eventHandlers = chartEventHandlersRef.current[cacheKey] ?? {};
      Object.entries(eventHandlers).forEach(([eventName, handlers]) => {
        if (handlers.length === 0) return;
        nextEvents.add(eventName);
        handlers.forEach((handler) => {
          (chart as any).on(eventName, (params: any) => {
            try {
              handler(params);
            } catch (error) {
              console.error(`Error ejecutando handler ${eventName} de grafica`, error);
            }
          });
        });
      });
      attachedChartEventsRef.current[groupKey] = nextEvents;
      chart.resize();
    },
    [isLightTheme]
  );

  const buildUrl = (endpoint: ChartEndpoint, scopedVars?: Record<string, any>) => {
    const rawUrl = endpoint.url ? replaceVars(endpoint.url, scopedVars) : "";
    if (!endpoint.useProxy) return rawUrl;
    const proxyPath = endpoint.proxyPath ? replaceVars(endpoint.proxyPath, scopedVars) : "";
    if (!proxyPath) {
      throw new Error("Falta rutaProxy para usar el proxy.");
    }
    const base = `/api/plugin-proxy/${PLUGIN_ID}/${proxyPath}`;
    if (!rawUrl) return base;
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      return rawUrl;
    }
    const baseClean = base.replace(/\/+$/, "");
    const pathClean = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
    return `${baseClean}${pathClean}`;
  };

  const fetchChartData = useCallback(async (endpoint?: ChartEndpoint) => {
    if (!endpoint) return null;
    const scopedVars = effectiveScopedVars;
    if (endpoint.refId) {
      const series = data?.series ?? [];
      const matches = series.filter((frame) => frame.refId === endpoint.refId);
      if (matches.length === 0) {
        throw new Error(`No se encontro data para la consulta ${endpoint.refId}.`);
      }
      return matches.length === 1 ? matches[0] : matches;
    }
    if (!endpoint.url && !endpoint.useProxy) return null;

    const resolvedUrl = buildUrl(endpoint, scopedVars);
    const resolvedHeaders = endpoint.headers ? deepReplace(endpoint.headers, scopedVars) : undefined;
    const resolvedBody = endpoint.body ? deepReplace(endpoint.body, scopedVars) : undefined;
    const method = (endpoint.method ?? "GET").toUpperCase() as "GET" | "POST";
    const headers = withAuthTokenHeader(resolvedHeaders ? { ...resolvedHeaders } : undefined, jwtToken) ?? {};
    const init: RequestInit = { method };
    if (method === "POST") {
      init.body = JSON.stringify(resolvedBody ?? {});
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }
    if (Object.keys(headers).length > 0) {
      init.headers = headers;
    }
    const response = await fetch(resolvedUrl, init);
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al consultar ${resolvedUrl}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }, [data?.series, effectiveScopedVars, jwtToken, stabilizedVarsFingerprint]);

  const buildOptionFromCode = useCallback(
    (groupKey: string, cacheKey: string, code: string, payload: unknown, vars: Record<string, unknown>) => {
      const handlers: ChartEventRegistry = {};
      const registerEvent = (eventName: string, handler: ChartEventHandler) => {
        if (typeof eventName !== "string" || typeof handler !== "function") return;
        handlers[eventName] = [...(handlers[eventName] ?? []), handler];
      };
      const clearEvent = (eventName?: string) => {
        if (!eventName) {
          Object.keys(handlers).forEach((key) => delete handlers[key]);
          return;
        }
        delete handlers[eventName];
      };

      try {
        chartEventHandlersRef.current[cacheKey] = handlers;
        const context = createChartCodeContext(groupKey, payload, vars, registerEvent, clearEvent);
        const fn = new Function("data", "echarts", "vars", "context", code);
        const result = fn(payload, echarts, vars, context);
        return result;
      } catch (error) {
        delete chartEventHandlersRef.current[cacheKey];
        console.error("Error ejecutando codigo de grafica", error);
        return null;
      }
    },
    [createChartCodeContext]
  );

  const buildHtmlFromCode = useCallback(
    // Agregamos 'async' aquí
    async (jsCode: string, payload: unknown, vars: Record<string, unknown>, baseHtml?: string, baseCss?: string) => {
      try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction("data", "vars", "baseHtml", "baseCss", jsCode);
        
        // Agregamos 'await' aquí
        const result = await fn(payload, vars, baseHtml ?? "", baseCss ?? "");
        
        if (typeof result === "string") {
          return { html: result, css: baseCss ?? "" } as HtmlContent;
        }
        if (result && typeof result === "object") {
          const html = String((result as any).html ?? baseHtml ?? "");
          const cssText = String((result as any).css ?? baseCss ?? "");
          return { html, css: cssText } as HtmlContent;
        }
        return { html: baseHtml ?? "", css: baseCss ?? "" } as HtmlContent;
      } catch (error) {
        console.error("Error ejecutando codigo de componente HTML", error);
        return null;
      }
    },
    []
  );

  const applyWidgetMarkup = useCallback((root: HTMLDivElement, html: string, cssText: string) => {
    const styleMarkup = cssText ? `<style data-dsk-widget-style>${cssText}</style>` : "";
    root.innerHTML = `${styleMarkup}<div data-dsk-widget-content>${html}</div>`;
  }, []);

  const buildWidgetLifecycleContext = useCallback(
    (groupKey: string, chartKey: string, runtime: WidgetRuntime): WidgetLifecycleContext => ({
      root: runtime.root,
      contentRoot: runtime.root.querySelector("[data-dsk-widget-content]"),
      data: runtime.payload,
      vars: runtime.vars,
      echarts,
      state: runtime.state,
      cleanup: (fn: () => void) => {
        if (typeof fn === "function") {
          runtime.cleanupFns.push(fn);
        }
      },
      grafana: {
        locationService,
        scopedVars: effectiveScopedVars,
        replaceVariables: (value: string, format?: string) => replaceVars(value, effectiveScopedVars, format),
      },
      panel: {
        id,
        pluginId: PLUGIN_ID,
        groupKey,
        chartKey,
        width,
        height,
      },
    }),
    [effectiveScopedVars, height, id, width]
  );

  const disposeWidgetRuntime = useCallback(
    (groupKey: string, clearMarkup = false) => {
      destroyWidgetRuntimeInternal(groupKey, clearMarkup);
    },
    [destroyWidgetRuntimeInternal]
  );

  const buildWidgetFromCode = useCallback(
    (jsCode: string, payload: unknown, vars: Record<string, unknown>, baseHtml?: string, baseCss?: string) => {
      try {
        const fn = new Function("data", "vars", "baseHtml", "baseCss", "echarts", jsCode);
        const result = fn(payload, vars, baseHtml ?? "", baseCss ?? "", echarts);
        if (typeof result === "string") {
          return { html: result, css: baseCss ?? "", api: null } as WidgetExecutionResult;
        }
        if (result && typeof result === "object") {
          const asWidget = result as WidgetApi;
          const html = String(asWidget.html ?? baseHtml ?? "");
          const cssText = String(asWidget.css ?? baseCss ?? "");
          const hasLifecycle =
            typeof asWidget.mount === "function" ||
            typeof asWidget.update === "function" ||
            typeof asWidget.destroy === "function";
          return { html, css: cssText, api: hasLifecycle ? asWidget : null } as WidgetExecutionResult;
        }
        return { html: baseHtml ?? "", css: baseCss ?? "", api: null } as WidgetExecutionResult;
      } catch (error) {
        console.error("Error ejecutando codigo de widget", error);
        return null;
      }
    },
    []
  );

  const getHtmlContent = useCallback(
    async (groupKey: string, chart: ChartConfig) => {
      const cacheKey = `${groupKey}::${chart.key}`;
      const scopedVarsVersionAtStart = scopedVarsVersionRef.current;
      const errorAt = errorCacheRef.current[cacheKey];
      if (errorAt && Date.now() - errorAt < 5000) {
        return null;
      }
      const cached = htmlCacheRef.current[cacheKey];
      if (cached) return cached;
      const inflight = htmlInFlightRef.current[cacheKey];
      if (inflight) return inflight;

      const promise = (async () => {
        if (chart.endpoint) {
          setLoadingCharts((prev) => ({ ...prev, [cacheKey]: true }));
        }
        try {
          let payload: unknown = data;
          if (chart.endpoint) {
            payload = await fetchChartData(chart.endpoint);
          }

          const jsCode = (chart.js ?? chart.code ?? "").trim();
          let content: HtmlContent | null = null;
          if (jsCode) {
            content = await buildHtmlFromCode(jsCode, payload, {
              scopedVars: effectiveScopedVars,
              grafanaData: data,
              refId: chart.endpoint?.refId,
            }, chart.html ?? "", chart.css ?? "");
            if (!content) {
              throw new Error("La funcion del componente HTML no retorno contenido valido.");
            }
          } else {
            content = { html: chart.html ?? "", css: chart.css ?? "" };
          }

          if (scopedVarsVersionRef.current !== scopedVarsVersionAtStart) {
            return null;
          }
          htmlCacheRef.current[cacheKey] = content;
          setHtmlContents((prev) => ({ ...prev, [cacheKey]: content as HtmlContent }));
          setChartErrors((prev) => {
            if (!prev[cacheKey]) return prev;
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          return content;
        } catch (error) {
          if (scopedVarsVersionRef.current !== scopedVarsVersionAtStart) {
            return null;
          }
          const message = error instanceof Error ? error.message : "Error al cargar componente HTML";
          setChartErrors((prev) => ({ ...prev, [cacheKey]: message }));
          errorCacheRef.current[cacheKey] = Date.now();
          return null;
        } finally {
          if (chart.endpoint) {
            setLoadingCharts((prev) => {
              if (!prev[cacheKey]) return prev;
              const next = { ...prev };
              delete next[cacheKey];
              return next;
            });
          }
        }
      })();

      htmlInFlightRef.current[cacheKey] = promise;
      const result = await promise;
      htmlInFlightRef.current[cacheKey] = null;
      return result;
    },
    [buildHtmlFromCode, data, effectiveScopedVars, fetchChartData]
  );

  const renderWidget = useCallback(
    async (groupKey: string, chart: ChartConfig) => {
      const cacheKey = `${groupKey}::${chart.key}`;
      const root = widgetDomRefs.current[groupKey];
      if (!root) {
        return;
      }

      if (chart.endpoint) {
        setLoadingCharts((prev) => ({ ...prev, [cacheKey]: true }));
      }

      try {
        let payload: unknown = data;
        if (chart.endpoint) {
          payload = await fetchChartData(chart.endpoint);
        }

        const vars = {
          scopedVars: effectiveScopedVars,
          grafanaData: data,
          refId: chart.endpoint?.refId,
        };
        const jsCode = (chart.js ?? chart.code ?? "").trim();
        const widgetResult = jsCode
          ? buildWidgetFromCode(jsCode, payload, vars, chart.html ?? "", chart.css ?? "")
          : ({ html: chart.html ?? "", css: chart.css ?? "", api: null } as WidgetExecutionResult);

        if (!widgetResult) {
          throw new Error("La funcion del widget no retorno una configuracion valida.");
        }

        const currentRuntime = widgetRuntimeRef.current[groupKey];
        const shouldRemount =
          !currentRuntime ||
          currentRuntime.cacheKey !== cacheKey ||
          currentRuntime.root !== root ||
          currentRuntime.html !== widgetResult.html ||
          currentRuntime.css !== widgetResult.css;

        if (shouldRemount) {
          disposeWidgetRuntime(groupKey, false);
          applyWidgetMarkup(root, widgetResult.html, widgetResult.css);
          const nextRuntime: WidgetRuntime = {
            cacheKey,
            chartKey: chart.key,
            root,
            html: widgetResult.html,
            css: widgetResult.css,
            api: widgetResult.api,
            state: {},
            payload,
            vars,
            cleanupFns: [],
          };
          widgetRuntimeRef.current[groupKey] = nextRuntime;
          if (widgetResult.api?.mount) {
            widgetResult.api.mount(buildWidgetLifecycleContext(groupKey, chart.key, nextRuntime));
          }
        } else {
          currentRuntime.payload = payload;
          currentRuntime.vars = vars;
          currentRuntime.chartKey = chart.key;
          currentRuntime.api = widgetResult.api;
          if (currentRuntime.api?.update) {
            currentRuntime.api.update(buildWidgetLifecycleContext(groupKey, chart.key, currentRuntime));
          }
        }

        setChartErrors((prev) => {
          if (!prev[cacheKey]) {
            return prev;
          }
          const next = { ...prev };
          delete next[cacheKey];
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error al cargar el widget";
        setChartErrors((prev) => ({ ...prev, [cacheKey]: message }));
        errorCacheRef.current[cacheKey] = Date.now();
      } finally {
        if (chart.endpoint) {
          setLoadingCharts((prev) => {
            if (!prev[cacheKey]) {
              return prev;
            }
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
        }
      }
    },
    [
      applyWidgetMarkup,
      buildWidgetFromCode,
      buildWidgetLifecycleContext,
      data,
      disposeWidgetRuntime,
      effectiveScopedVars,
      fetchChartData,
    ]
  );

  const getChartOption = useCallback(
    async (groupKey: string, chart: ChartConfig) => {
      const cacheKey = `${groupKey}::${chart.key}`;
      const scopedVarsVersionAtStart = scopedVarsVersionRef.current;
      const errorAt = errorCacheRef.current[cacheKey];
      if (errorAt && Date.now() - errorAt < 5000) {
        return null;
      }
      const cached = optionCacheRef.current[cacheKey];
      if (cached) return cached;
      const inflight = inFlightRef.current[cacheKey];
      if (inflight) return inflight;

      const promise = (async () => {
        if (chart.endpoint) {
          setLoadingCharts((prev) => ({ ...prev, [cacheKey]: true }));
        }
        try {
          let option = chart.option ?? null;
          let payload: unknown = null;
          if (chart.endpoint) {
            payload = await fetchChartData(chart.endpoint);
          }

          if (chart.code) {
            option = buildOptionFromCode(groupKey, cacheKey, chart.code, payload, {
              baseOption: chart.option ?? null,
              scopedVars: effectiveScopedVars,
              refId: chart.endpoint?.refId,
            });
            if (!option) {
              throw new Error("La funcion de la grafica no retorno un option valido.");
            }
          } else if (!option && chart.endpoint) {
            option = null;
          }

          if (scopedVarsVersionRef.current !== scopedVarsVersionAtStart) {
            return null;
          }

          if (option) {
            optionCacheRef.current[cacheKey] = option;
          }
          setChartErrors((prev) => {
            if (!prev[cacheKey]) return prev;
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          return option;
        } catch (error) {
          if (scopedVarsVersionRef.current !== scopedVarsVersionAtStart) {
            return null;
          }
          const message = error instanceof Error ? error.message : "Error al cargar la grafica";
          setChartErrors((prev) => ({ ...prev, [cacheKey]: message }));
          errorCacheRef.current[cacheKey] = Date.now();
          return null;
        } finally {
          if (chart.endpoint) {
            setLoadingCharts((prev) => {
              if (!prev[cacheKey]) return prev;
              const next = { ...prev };
              delete next[cacheKey];
              return next;
            });
          }
        }
      })();

      inFlightRef.current[cacheKey] = promise;
      const result = await promise;
      inFlightRef.current[cacheKey] = null;
      return result;
    },
    [buildOptionFromCode, effectiveScopedVars, fetchChartData]
  );

  const renderChart = useCallback(
    async (groupKey: string, chart: ChartConfig) => {
      const option = await getChartOption(groupKey, chart);
      if (!option) return;
      ensureChart(groupKey, `${groupKey}::${chart.key}`, option);
    },
    [ensureChart, getChartOption]
  );

  const renderComponent = useCallback(
    async (groupKey: string, chart: ChartConfig) => {
      if (chart.type !== "widget") {
        disposeWidgetRuntime(groupKey, true);
      }
      if (chart.type === "html") {
        const existing = chartInstancesRef.current[groupKey];
        if (existing && !existing.isDisposed?.()) {
          existing.dispose();
          chartInstancesRef.current[groupKey] = null;
        }
        await getHtmlContent(groupKey, chart);
        return;
      }
      if (chart.type === "widget") {
        const existing = chartInstancesRef.current[groupKey];
        if (existing && !existing.isDisposed?.()) {
          existing.dispose();
          chartInstancesRef.current[groupKey] = null;
        }
        await renderWidget(groupKey, chart);
        return;
      }
      await renderChart(groupKey, chart);
    },
    [disposeWidgetRuntime, getHtmlContent, renderChart, renderWidget]
  );

  useEffect(() => {
    if (sections.length === 0) {
      return;
    }

    sections.forEach((group) => {
      if (!openKeys.has(group.key)) {
        return;
      }
      const activeKey = activeCharts[group.key] ?? group.charts[0]?.key;
      const activeChart = group.charts.find((c) => c.key === activeKey);
      if (!activeChart) return;
      requestAnimationFrame(() => {
        renderComponent(group.key, activeChart);
      });
    });
  }, [activeCharts, openKeys, pinnedSections, renderComponent, sections]);

  const onToggle = useCallback(
    (key: string, open: boolean) => {
      const updateVisuals = () => {
        setOpenKeys((prev) => {
          const next = new Set(prev);
          if (open) {
            next.add(key);
          } else {
            next.delete(key);
          }
          return next;
        });
      };

      /* Eliminamos la View Transition para el toggle. 
         Al abrir/cerrar, usamos solo animación CSS local para que el contenido 
         se mantenga estrictamente dentro de los límites del DOM y no sobresalga. */
      updateVisuals();

      if (open) {
        // ... (El resto de tu lógica de renderComponent se queda exactamente igual) ...
        const group = sections.find((c) => c.key === key);
        if (!group) return;
        const activeKey = activeCharts[key] ?? group.charts[0]?.key;
        const activeChart = group.charts.find((c) => c.key === activeKey);
        if (!activeChart) return;

        setTimeout(() => {
          requestAnimationFrame(() => renderComponent(key, activeChart));
        }, 400);
      }
    },
    [activeCharts, renderComponent, sections]
  );

  const reorderSections = useCallback(
    (sectionKey: string, targetSectionKey: string) => {
      if (!selectedCategoryKey) {
        return;
      }

      if (sectionKey === targetSectionKey) {
        return;
      }

      const currentOrder = sections.map((section) => section.key);
      if (!currentOrder.includes(sectionKey) || !currentOrder.includes(targetSectionKey)) {
        return;
      }

      if (pinnedSections.has(sectionKey) || pinnedSections.has(targetSectionKey)) {
        return;
      }

      const movableSectionKeys = currentOrder.filter((key) => !pinnedSections.has(key));
      const fromIndexInMovable = movableSectionKeys.indexOf(sectionKey);
      const targetIndexInMovable = movableSectionKeys.indexOf(targetSectionKey);

      if (fromIndexInMovable === -1 || targetIndexInMovable === -1 || fromIndexInMovable === targetIndexInMovable) {
        return;
      }

      const newMovableOrder = moveItem(movableSectionKeys, fromIndexInMovable, targetIndexInMovable);

      const finalOrder: string[] = [];
      let movableIndex = 0;
      for (let i = 0; i < currentOrder.length; i++) {
        const originalSectionKey = currentOrder[i];
        if (pinnedSections.has(originalSectionKey)) {
          finalOrder.push(originalSectionKey);
        } else {
          finalOrder.push(newMovableOrder[movableIndex]);
          movableIndex++;
        }
      }

      const applyMove = () => {
        setSectionOrderByCategory((prev) => ({
          ...prev,
          [selectedCategoryKey]: finalOrder,
        }));
      };

      applyMove();
    },
    [sections, selectedCategoryKey, pinnedSections]
  );

  const onSectionDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, sectionKey: string) => {
      if (pinnedSections.has(sectionKey)) {
        event.preventDefault();
        return;
      }

      setDraggedSectionKey(sectionKey);
      setDragOverSectionKey(sectionKey);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sectionKey);
    },
    [pinnedSections]
  );

  const onSectionDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, sectionKey: string) => {
      if (!draggedSectionKey || draggedSectionKey === sectionKey || pinnedSections.has(sectionKey)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dragOverSectionKey !== sectionKey) {
        setDragOverSectionKey(sectionKey);
      }
    },
    [dragOverSectionKey, draggedSectionKey, pinnedSections]
  );

  const onSectionDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, targetSectionKey: string) => {
      event.preventDefault();
      const sourceSectionKey = draggedSectionKey ?? event.dataTransfer.getData("text/plain");

      if (sourceSectionKey) {
        reorderSections(sourceSectionKey, targetSectionKey);
      }

      setDraggedSectionKey(null);
      setDragOverSectionKey(null);
    },
    [draggedSectionKey, reorderSections]
  );

  const onSectionDragEnd = useCallback(() => {
    setDraggedSectionKey(null);
    setDragOverSectionKey(null);
  }, []);

  const onSwitchChart = useCallback(
    (groupKey: string, chartKey: string) => {
      setActiveCharts((prev) => ({ ...prev, [groupKey]: chartKey }));
      const group = sections.find((c) => c.key === groupKey);
      const activeChart = group?.charts.find((c) => c.key === chartKey);
      if (!activeChart) return;
      requestAnimationFrame(() => renderComponent(groupKey, activeChart));
    },
    [renderComponent, sections]
  );

  const onRemoveChart = useCallback(
    (groupKey: string, chartKey: string) => {
      setHiddenCharts((prev) => {
        const next = new Set(prev[groupKey] ?? []);
        next.add(chartKey);
        return { ...prev, [groupKey]: next };
      });

      setActiveCharts((prev) => {
        if (prev[groupKey] !== chartKey) {
          return prev;
        }
        const group = sections.find((c) => c.key === groupKey);
        if (!group) return prev;
        const hidden = hiddenCharts[groupKey] ?? new Set<string>();
        const nextChart = group.charts.find((c) => c.key !== chartKey && !hidden.has(c.key));
        return { ...prev, [groupKey]: nextChart?.key ?? "" };
      });
    },
    [hiddenCharts, sections]
  );

  const makeChartRef = useCallback(
    (groupKey: string, chart: ChartConfig) => (node: HTMLDivElement | null) => {
      if (chart.type === "html" || chart.type === "widget") {
        return;
      }
      if (node) {
        domRefs.current[groupKey] = node;
        return;
      }
      domRefs.current[groupKey] = null;
    },
    []
  );

  const makeWidgetRef = useCallback(
  (groupKey: string, chart: ChartConfig) => (node: HTMLDivElement | null) => {
    if (chart.type !== "widget") {
      return;
    }
    widgetDomRefs.current[groupKey] = node;
  },
  [] 
);

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <style>{`
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      {categories.length > 1 && (
        <div
          className={css`
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            margin-bottom: 12px;
            border-radius: 12px;
            background: ${ui.toolbarBg};
            border: 1px solid ${ui.toolbarBorder};
            box-shadow: 0 4px 12px ${ui.toolbarShadow};
          `}
        >
          <span className={css`font-size: 12px; font-weight: 700; color: ${ui.textPrimary};`}>
            Mostrar:
          </span>
          {categories.map((category) => {
            const isActive = selectedCategory === category.key;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => onToggleCategory(category.key)}
                aria-pressed={isActive}
                className={css`
                  border: 1px solid ${isActive ? ui.chipActiveBorder : ui.chipBorder};
                  background: ${isActive ? ui.chipActiveBg : ui.chipBg};
                  color: ${isActive ? ui.chipActiveText : ui.chipText};
                  font-size: 12px;
                  font-weight: 600;
                  padding: 6px 12px;
                  border-radius: 999px;
                  cursor: pointer;
                `}
              >
                {category.title}
              </button>
            );
          })}
        </div>
      )}

      {configError && (
        <div
          className={css`
            margin-bottom: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            background: rgba(180, 40, 40, 0.12);
            border: 1px solid rgba(180, 40, 40, 0.35);
            color: #c0392b;
            font-size: 12px;
          `}
        >
          {configError}
        </div>
      )}
      {isRemoteConfigLoading && !localParsedConfig.config && (
        <div
          className={css`
            margin-bottom: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            background: ${ui.infoBg};
            border: 1px solid ${ui.infoBorder};
            color: ${ui.infoText};
            font-size: 12px;
          `}
        >
          Cargando configuracion desde endpoint alternativo...
        </div>
      )}

      <div
        className={css`
          display: ${accordionLayoutMode === "horizontal" ? "grid" : "block"};
          grid-template-columns: ${accordionLayoutMode === "horizontal" ? `repeat(${accordionColumns}, minmax(0, 1fr))` : "none"};
          gap: ${accordionLayoutMode === "horizontal" ? "12px" : "0"};
          align-items: start;
        `}
      >
      {sections.map((cfg) => {
        const isOpen = openKeys.has(cfg.key);
        const isPinned = pinnedSections.has(cfg.key);
        const isDragged = draggedSectionKey === cfg.key;
        const isDropTarget = dragOverSectionKey === cfg.key && draggedSectionKey !== cfg.key;
        const hidden = hiddenCharts[cfg.key] ?? new Set<string>();
        const visibleCharts = cfg.charts.filter((c) => !hidden.has(c.key));
        const fallbackKey = visibleCharts[0]?.key ?? "";
        const activeKey = activeCharts[cfg.key] ?? fallbackKey;
        const activeChart = visibleCharts.find((c) => c.key === activeKey) ?? visibleCharts[0];
        const errorKey = activeChart ? `${cfg.key}::${activeChart.key}` : "";
        const chartError = errorKey ? chartErrors[errorKey] : null;
        const htmlContent = errorKey ? htmlContents[errorKey] : undefined;
        const chartLoading = (errorKey ? Boolean(loadingCharts[errorKey]) : false) || isWaitingVars;
        return (
        <div
          key={cfg.key}
          ref={(node) => {
            sectionContainerRefs.current[cfg.key] = node;
          }}
          onDragOver={(event) => onSectionDragOver(event, cfg.key)}
          onDrop={(event) => onSectionDrop(event, cfg.key)}
          className={css`
            margin-bottom: ${accordionLayoutMode === "horizontal" ? "0" : "12px"};
            will-change: transform;
          `}
        >
        <details
          open={isOpen}
          className={css`
            border-radius: 12px;
            border: 1px solid ${ui.cardBorder};
            background: ${ui.cardBg};
            box-shadow:
              0 6px 18px ${ui.cardShadow1},
              0 2px 6px ${ui.cardShadow2};
            overflow: hidden;
            contain: paint;
            transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s;
            border-color: ${isDropTarget ? ui.infoBorder : ui.cardBorder};
            box-shadow:
              ${isDropTarget ? `0 0 0 2px ${ui.infoBorder},` : ""}
              0 6px 18px ${ui.cardShadow1},
              0 2px 6px ${ui.cardShadow2};
            opacity: ${isDragged ? 0.7 : 1};
            transform: ${isDropTarget ? "translateY(-2px)" : "none"};

            &[open] {
              border-color: ${ui.infoBorder};
            }

            &[open] summary ~ * {
              animation: slideDownFade 0.25s ease-out forwards;
            }

            @keyframes slideDownFade {
              from {
                opacity: 0;
                transform: translateY(-8px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}
        >
          <summary
            onClick={(e) => {
              e.preventDefault(); 
              const isOpen = openKeys.has(cfg.key);
              onToggle(cfg.key, !isOpen);
            }}
            className={css`
              cursor: pointer;
              user-select: none;
              padding: 6px 10px;
              font-weight: 700;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              background: ${ui.summaryBg};
              color: ${ui.summaryText};
              list-style: none;
              transition: background 180ms ease, color 180ms ease;

              &::-webkit-details-marker {
                display: none;
              }

              &:hover {
                background: ${ui.summaryHoverBg};
              }
            `}
          >
            <span className={css`display: flex; flex-direction: column; gap: 2px;`}>
              <span className={css`font-size: 13px;`}>{cfg.title}</span>
              {cfg.subtitle && (
                <span className={css`font-size: 11px; font-weight: 500; color: ${ui.summaryMetaText};`}>
                  {cfg.subtitle}
                </span>
              )}
            </span>
            <span
              className={css`
                display: inline-flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                flex-shrink: 0;
                font-size: 12px;
                font-weight: 600;
                color: ${ui.summaryMetaText};
              `}
            >
              <span
                className={css`
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                `}
              >
                <button
                  type="button"
                  draggable={!isPinned}
                  aria-label={`Arrastrar ${cfg.title}`}
                  title={isPinned ? `${cfg.title} esta fijado` : `Arrastrar ${cfg.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(event) => onSectionDragStart(event, cfg.key)}
                  onDragEnd={onSectionDragEnd}
                  className={css`
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 24px;
                    height: 24px;
                    border-radius: 999px;
                    border: 1px solid ${ui.summaryChevronBorder};
                    background: ${ui.summaryChevronBg};
                    color: ${ui.summaryText2};
                    cursor: ${isPinned ? "not-allowed" : isDragged ? "grabbing" : "grab"};
                    opacity: ${isPinned ? 0.45 : 1};
                  `}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className={css`
                      display: block;
                      width: 14px;
                      height: 14px;
                    `}
                  >
                    <path
                      d="M12 3 L12 21 M3 12 L21 12 M12 3 L8.5 6.5 M12 3 L15.5 6.5 M12 21 L8.5 17.5 M12 21 L15.5 17.5 M3 12 L6.5 8.5 M3 12 L6.5 15.5 M21 12 L17.5 8.5 M21 12 L17.5 15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {/*
                <button
                  type="button"
                  aria-label={pinnedSections.has(cfg.key) ? `Desfijar ${cfg.title}` : `Fijar ${cfg.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTogglePinSection(cfg.key);
                  }}
                  className={css`
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border-radius: 999px;
                    border: 1px solid ${ui.summaryChevronBorder};
                    background: ${pinnedSections.has(cfg.key) ? ui.infoBorder : ui.summaryChevronBg};
                    color: ${pinnedSections.has(cfg.key) ? ui.chipActiveText : ui.summaryText2};
                    cursor: pointer;
                  `}
                >
                  <Icon name={pinnedSections.has(cfg.key) ? "lock" : "unlock"} size="sm" />
                </button>
                */}
              </span>
              {isOpen ? "Ocultar" : "Mostrar"}
              <span
                className={css`
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  border: 1px solid ${ui.summaryChevronBorder};
                  background: ${ui.summaryChevronBg};
                  color: ${ui.summaryText2};
                `}
              >
                <Icon name={isOpen ? "angle-up" : "angle-down"} size="md" />
              </span>
            </span>
          </summary>

          {visibleCharts.length > 1 && (
            <div
              className={css`
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                padding: 10px 12px 0;
              `}
            >
              {visibleCharts.map((chart) => {
                const isActive = chart.key === activeKey;
                return (
                  <button
                    key={chart.key}
                    type="button"
                    onClick={() => onSwitchChart(cfg.key, chart.key)}
                    className={css`
                      border: 1px solid ${isActive ? ui.chipActiveBorder : ui.chipBorder};
                      background: ${isActive ? ui.chipActiveBg : ui.chipBg};
                      color: ${isActive ? ui.chipActiveText : ui.chipText};
                      font-size: 12px;
                      font-weight: 600;
                      padding: 6px 10px;
                      border-radius: 999px;
                      cursor: pointer;
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                    `}
                  >
                    <span>{chart.title}</span>
                    <span
                      role="button"
                      aria-label={`Eliminar ${chart.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveChart(cfg.key, chart.key);
                      }}
                      className={css`
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        font-size: 12px;
                        line-height: 12px;
                        background: ${isActive ? ui.chipXActiveBg : ui.chipXBg};
                        color: ${isActive ? ui.chipActiveText : ui.chipText};
                        cursor: pointer;
                      `}
                    >
                      ×
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {chartError && (
            <div
              className={css`
                margin: 8px 12px 0;
                padding: 8px 10px;
                border-radius: 8px;
                background: rgba(180, 40, 40, 0.12);
                border: 1px solid rgba(180, 40, 40, 0.35);
                color: #c0392b;
                font-size: 12px;
              `}
            >
              {chartError}
            </div>
          )}

          <div
            className={css`
              position: relative;
              padding: 10px 12px 16px;
            `}
          >
            {activeChart?.type === "html" ? (
              <div
                key={`${cfg.key}:${activeChart?.key ?? "none"}:html`}
                style={{
                  width: "100%",
                  minHeight: activeChart?.height ?? 280,
                  opacity: chartLoading ? 0.45 : 1,
                  filter: chartLoading ? "blur(1.25px)" : "blur(0px)",
                  transform: chartLoading ? "scale(0.995)" : "scale(1)",
                  transition: "opacity 240ms ease, filter 260ms ease, transform 260ms ease",
                  overflowX: "auto",
                }}
              >
                {htmlContent?.css && <style>{htmlContent.css}</style>}
                <div dangerouslySetInnerHTML={{ __html: htmlContent?.html ?? activeChart?.html ?? "" }} />
              </div>
            ) : activeChart?.type === "widget" ? (
              <div
                key={`${cfg.key}:${activeChart?.key ?? "none"}:widget`}
                ref={activeChart ? makeWidgetRef(cfg.key, activeChart) : undefined}
                style={{
                  width: "100%",
                  minHeight: activeChart?.height ?? 280,
                  opacity: chartLoading ? 0.45 : 1,
                  filter: chartLoading ? "blur(1.25px)" : "blur(0px)",
                  transform: chartLoading ? "scale(0.995)" : "scale(1)",
                  transition: "opacity 240ms ease, filter 260ms ease, transform 260ms ease",
                  overflowX: "auto",
                }}
              />
            ) : (
              <div
                key={`${cfg.key}:${activeChart?.key ?? "none"}:chart`}
                ref={activeChart ? makeChartRef(cfg.key, activeChart) : undefined}
                style={{
                  width: "100%",
                  height: activeChart?.height ?? 280,
                  opacity: chartLoading ? 0.45 : 1,
                  filter: chartLoading ? "blur(1.25px)" : "blur(0px)",
                  transform: chartLoading ? "scale(0.995)" : "scale(1)",
                  transition: "opacity 240ms ease, filter 260ms ease, transform 260ms ease",
                }}
              />
            )}
            <div
              className={css`
                position: absolute;
                inset: 10px 12px 16px;
                border-radius: 10px;
                background: ${ui.overlayBg};
                backdrop-filter: blur(2px);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 10px;
                opacity: ${chartLoading ? 1 : 0};
                transform: ${chartLoading ? "translateY(0)" : "translateY(4px)"};
                transition: opacity 220ms ease, transform 220ms ease;
                pointer-events: ${chartLoading ? "auto" : "none"};
              `}
            >
              <div
                className={css`
                  display: inline-flex;
                  align-items: center;
                  gap: 12px;
                `}
              >
                <span
                  className={css`
                    width: 18px;
                    height: 28px;
                    border-left: 4px solid ${ui.loaderInk};
                    border-top: 4px solid ${ui.loaderInk};
                    border-bottom: 4px solid ${ui.loaderInk};
                    border-right: 0;
                    border-radius: 7px 0 0 7px;
                    animation: dsk-loader-pulse 1.1s ease-in-out infinite;
                  `}
                />
                <span
                  className={css`
                    font-size: 48px;
                    line-height: 1;
                    font-weight: 700;
                    letter-spacing: 2px;
                    font-style: italic;
                    color: ${ui.loaderWord};
                    text-transform: uppercase;
                  `}
                >
                  DESKOVER
                </span>
                <span
                  className={css`
                    width: 18px;
                    height: 28px;
                    border-right: 4px solid ${ui.loaderInk};
                    border-top: 4px solid ${ui.loaderInk};
                    border-bottom: 4px solid ${ui.loaderInk};
                    border-left: 0;
                    border-radius: 0 7px 7px 0;
                    animation: dsk-loader-pulse 1.1s 0.2s ease-in-out infinite;
                  `}
                />
              </div>
              <div
                className={css`
                  display: flex;
                  gap: 10px;
                  margin-top: 2px;
                `}
              >
                <span
                  className={css`
                    width: 11px;
                    height: 11px;
                    border-radius: 50%;
                    background: ${ui.loaderDot};
                    animation: dsk-blink 1s infinite ease-in-out;
                  `}
                />
                <span
                  className={css`
                    width: 11px;
                    height: 11px;
                    border-radius: 50%;
                    background: ${ui.loaderDot};
                    animation: dsk-blink 1s 0.22s infinite ease-in-out;
                  `}
                />
              </div>
            </div>
          </div>
        </details>
        </div>
      );
      })}
      </div>
    </div>
  );
};
