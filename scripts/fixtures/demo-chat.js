import {buildAnalysisCharts,wantsAnalysisVisual} from "../../src/components/analysis/charts.js?v=dates-model-venue-20261015";
import { config } from "../../src/config.js";
import {chatRequest} from "../../src/services/chat.js";
import { advisorRowsFromBookings, advisorSnapshot } from "../../src/domain/demo-workspace.js";
import { reportMonths } from "../../src/domain/report-period.js";
import { advisorMetrics } from "../../src/domain/advisor-engine.js";
import { boundedDemoRequest } from "../../src/domain/chat-history.js?v=order-numbers-20261015";
// Chat figures are opt-in; fixed Dashboard charts use a separate path.
export function wantsChatVisual(message) {
 const q=String(message||"");
 return /饼图|圆环|图表|柱状|趋势图|分布图|排期图|日程图|画图|用图|chart|graph|visual|pie|donut|timeline/i.test(q)
   && !/(?:不要|不用|不需要|别)(?:再)?(?:画|生成|显示)?(?:任何)?(?:图表|图)|no charts?|without (?:any )?(?:charts?|graphs?)/i.test(q);
}
export function demoChatAdapter({
  getIdentity,
  getCatalog,
  getContext,
  getAdvisorRows,
  saveBatch,
  resolveLocal = () => null,
}) {
  const key = () => `sculpy-chat-300-v2:${getIdentity()}`;
  const read = (storageKey = key()) => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  };
  const write = (value, storageKey = key()) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  };
  return {
    mode: "demo",
    identity: getIdentity,
    async load(scope) {
      const state = read();
      return {
        turns: state[scope] || [],
        preferences: state.preferences || {
          verbosity: "detailed",
          instructions: "",
        },
      };
    },
    async preferences(value) {
      const state = read();
      write({ ...state, preferences: value });
    },
    async send(scope, body) {
      const storageKey = key(),
        state = read(storageKey),
        history = state[scope] || [];
      let result;
      const catalog=getCatalog();
      const rows = getAdvisorRows ? getAdvisorRows() : advisorRowsFromBookings(getCatalog().bookings);
      const preserveChart = /(?:饼图|pie)/i.test(body.message) && !/(?:300|虚拟|虚构|fictional|fixture)/i.test(body.message);
      const scopedReport = /(?:日报|daily|截至|as of|今日|[今昨明]天|组合|交叉|渠道|channel|婚礼|Wedding|化妆师|artist|Instagram|Google|Michelle|Miranda|Emily|Elaine|Giselle|Angelina|Yuki|Mira)/i.test(body.message);
      const local = wantsAnalysisVisual(body.message) || scopedReport || !preserveChart && /(?:300|虚拟|虚构|fictional|fixture|模拟|商业|获客|财务|利润|渠道|分析|analysis|analy[sz]e|profit|channel|acquisition|revenue|收入|营收|月|month)/i.test(body.message) ? null : resolveLocal(body.message);
      if (local) result = { turn: { ...local, engine:"local", id: body.requestId, user: body.message, createdAt: new Date().toISOString() } };
      else if (config.aiMode === "mock")
        result = {
          turn: {
            engine:"mock",
            id: body.requestId,
            user: body.message,
            answer:
              "这是模拟聊天回复。连续对话和个人偏好已保留；在线模式会读取相关订单再回答。",
            references: [],
            proposals: [],
            sourceIds: [],
            createdAt: new Date().toISOString(),
          },
        };
      else
        result = await chatRequest(boundedDemoRequest({
          mode: "demo",
          agentMode: new URLSearchParams(location.search).get("agent") === "legacy" ? undefined : "sdk",
          ...body,
          bookingId: scope === "global" ? null : scope,
          catalog,
          advisorFixture: getContext().role === "admin" ? advisorSnapshot(rows) : null,
          turns: history.slice(-12),
          preferences: { ...state.preferences, instructions: [state.preferences?.instructions, window.DemoI18n?.language === "zh" ? "请用中文回复。" : "Please respond in English, including summaries and suggestions."].filter(Boolean).join("\n") },
        }));
      if (wantsChatVisual(body.message) && !scopedReport && !preserveChart && scope === "global" && getContext().role === "admin" && /(?:月|month|季度|quarter|趋势|trend)/i.test(body.message)) {
        result.turn.chartKey = "monthly-analytics";
        result.turn.chartRows = reportMonths(body.message).map(month => ({month,amountCents:advisorMetrics(rows,{month}).completedCents}));
      }
      if(wantsChatVisual(body.message) && scope === "global" && getContext().role === "admin" && (!result.turn.chartKey || result.turn.demoReportSources?.length)) {
        result.turn.analysisCharts=buildAnalysisCharts({message:body.message,bookings:catalog.bookings,reports:result.turn.demoReportSources||[],previousReports:[...history].reverse().find(t=>t.demoReportSources?.length)?.demoReportSources||[],previousMessage:[...history].reverse().find(t=>t.demoReportSources?.length)?.user||''});
        if(result.turn.analysisCharts.length){delete result.turn.chartKey;delete result.turn.chartRows;}
      }
      const fresh = read(storageKey);
      write(
        {
          ...fresh,
          [scope]: [...(fresh[scope] || []), result.turn].slice(-100),
        },
        storageKey,
      );
      return result.turn;
    },
    async save(proposal, turn) {
      const context = getContext();
      return saveBatch({
        id: proposal.id,
        entityType: "booking",
        entityId: proposal.bookingId,
        rawText: turn.user,
        inputType: "text",
        createdBy:
          context.role === "admin" ? context.adminPersona : context.artistId,
        createdAt: new Date().toISOString(),
        items: [
          {
            id: crypto.randomUUID(),
            kind: proposal.kind,
            entityType: "booking",
            entityId: proposal.bookingId,
            text: proposal.text,
            status: proposal.kind === "change" ? "pending_review" : "confirmed",
            dueDate: null,
            assigneeId: null,
          },
        ],
      });
    },
  };
}
