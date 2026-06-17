import OpenAI from "openai";

// Load from environment variable + fallback for compile-time injection
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.REACT_APP_DASHSCOPE_KEY || "";

const client = new OpenAI({
  apiKey: DASHSCOPE_API_KEY || "sk-ws-H.REXEXPX.pfCL.MEYCIQC4iC3WAqGTFKMLewUNkgqrmNdqoDVo7XiSB_O-eqcAFAIhALDzLQTrW804mHviEs6deaKG55AMio6KIc1Y3dLHYmv7",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  dangerouslyAllowBrowser: true,
});

export interface PlaceModel {
  id: string;
  displayName: string;
  address: string;
  location?: { lat: number, lng: number };
  distanceMeters?: number;
}

export interface ToolsCallbacks {
  onSearchNearby: (query: string) => Promise<PlaceModel[]>;
  onSetDestination: (placeId: string, name: string) => void;
  onAddWaypoint: (placeId: string, name: string) => void;
  onSelectOption: (placeId: string) => void;
  onReroute?: () => void;
  onSetRouteMode?: (mode: 'driving' | 'riding') => void;
  onZoom?: (direction: 'in' | 'out') => void;
  onGetRouteSummary?: () => { distanceKm: string; timeMin: number; eta: string } | null;
  onFitRoute?: () => void;
}

// Tool definitions for OpenAI-compatible function calling
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchNearby",
      description: "Search for nearby places based on a query (e.g., 'McDonalds', 'gas station', 'rest stop'). Returns a list of nearby places with their place IDs and distances.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setDestination",
      description: "Set the final navigation destination. Use this if the user wants to change their ultimate destination.",
      parameters: {
        type: "object",
        properties: {
          placeId: { type: "string", description: "The Map place ID of the destination." },
          name: { type: "string", description: "The name of the destination." },
        },
        required: ["placeId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addWaypoint",
      description: "Add a stop (waypoint) to the current route. Use this if the user wants to go somewhere along the way without changing their final destination.",
      parameters: {
        type: "object",
        properties: {
          placeId: { type: "string", description: "The Map place ID of the waypoint." },
          name: { type: "string", description: "The name of the waypoint." },
        },
        required: ["placeId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reroute",
      description: "Re-plan the current route from the current location. Useful when the user says 'reroute', 'recalculate route', or has deviated from the planned path.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setRouteMode",
      description: "Change the route calculation mode between driving and riding/cycling.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["driving", "riding"], description: "Route mode: 'driving' for car, 'riding' for bike/cycling." },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "zoomMap",
      description: "Zoom the map in (closer) or out (farther).",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["in", "out"], description: "Zoom direction: 'in' to zoom closer, 'out' to zoom farther." },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRouteSummary",
      description: "Get a summary of the current route including total distance, estimated time, and ETA. Use this when the user asks 'how far', 'how long', 'when will I arrive', or 'how much longer'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fitRouteToView",
      description: "Zoom and center the map to show the entire remaining route from current location to destination.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

const MODEL = "qwen3.7-plus";

let conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

function buildSystemMessage(currentLocationCoords: string | null, currentDestinationName: string | null): string {
  return `You are a helpful voice navigation assistant.
The user is currently at coordinates: ${currentLocationCoords || 'Unknown'}.
Current destination: ${currentDestinationName || 'None'}.

When the user asks for places (e.g. "Nearest McDonalds"), immediately use the searchNearby tool to find out what's close.
Based on the results, you should verbally tell the user what you found and ask what they want to do.
Keep your spoken responses (text) VERY brief and conversational, as they will be read aloud while the user is driving/riding.

When the user confirms a place to go to, use either setDestination or addWaypoint to update the route! Don't just say you will, actually call the function.`;
}

export async function processVoiceCommand(
  requestText: string,
  currentLocationCoords: string | null,
  currentDestinationName: string | null,
  callbacks: ToolsCallbacks,
  onSpeak: (message: string) => void
) {
  try {
    // Reset conversation history at start of a new command
    conversationHistory = [];

    const systemMessage = buildSystemMessage(currentLocationCoords, currentDestinationName);

    // Add user message
    conversationHistory.push({ role: "user", content: requestText });

    // First call
    let response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemMessage },
        ...conversationHistory,
      ],
      tools: tools,
      tool_choice: "auto",
    });

    let choice = response.choices[0];
    let message = choice.message;

    // Add assistant message to history
    conversationHistory.push(message);

    // Handle tool calls loop
    while (message.tool_calls && message.tool_calls.length > 0) {
      const toolCallResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          fnArgs = {};
        }

        let functionResponseData: any = { success: true };

        if (fnName === "searchNearby") {
          const query = fnArgs.query || "";
          onSpeak("我在帮你找附近的结果，请稍等...");
          const results = await callbacks.onSearchNearby(query);
          functionResponseData = { results };
        } else if (fnName === "setDestination") {
          const { placeId, name } = fnArgs;
          callbacks.onSetDestination(placeId, name);
          functionResponseData = { success: true, message: `Destination set to ${name}` };
        } else if (fnName === "addWaypoint") {
          const { placeId, name } = fnArgs;
          callbacks.onAddWaypoint(placeId, name);
          functionResponseData = { success: true, message: `Waypoint ${name} added` };
        } else if (fnName === "reroute") {
          if (callbacks.onReroute) {
            callbacks.onReroute();
            functionResponseData = { success: true, message: "Route recalculated from current location." };
          } else {
            functionResponseData = { success: false, message: "No active route to reroute." };
          }
        } else if (fnName === "setRouteMode") {
          if (callbacks.onSetRouteMode) {
            callbacks.onSetRouteMode(fnArgs.mode);
            functionResponseData = { success: true, message: `Route mode switched to ${fnArgs.mode}.` };
          }
        } else if (fnName === "zoomMap") {
          if (callbacks.onZoom) {
            callbacks.onZoom(fnArgs.direction);
            functionResponseData = { success: true, message: `Zoomed ${fnArgs.direction}.` };
          }
        } else if (fnName === "getRouteSummary") {
          if (callbacks.onGetRouteSummary) {
            const summary = callbacks.onGetRouteSummary();
            functionResponseData = summary ? { distanceKm: summary.distanceKm, timeMin: summary.timeMin, eta: summary.eta } : { error: "Route not set" };
          }
        } else if (fnName === "fitRouteToView") {
          if (callbacks.onFitRoute) {
            callbacks.onFitRoute();
            functionResponseData = { success: true, message: "Map zoomed to show full route." };
          }
        }

        toolCallResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResponseData),
        });
      }

      // Add tool results to conversation
      conversationHistory.push(...toolCallResults);

      // Call again with tool results
      response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemMessage },
          ...conversationHistory,
        ],
        tools: tools,
        tool_choice: "auto",
      });

      choice = response.choices[0];
      message = choice.message;
      conversationHistory.push(message);
    }

    // Final text response
    const finalText = message.content || "";
    if (finalText) {
      onSpeak(finalText);
    } else {
      onSpeak("我已经为您设置好了目的地。");
    }
  } catch (error: any) {
    console.error("Error processing voice command with Qwen:", error);
    const errMsg = error?.message || String(error);
    if (
      errMsg.includes("429") ||
      errMsg.includes("quota") ||
      errMsg.includes("Rate limit") ||
      errMsg.includes("InsufficientBalance") ||
      errMsg.includes("Request throttled")
    ) {
      onSpeak("抱歉，当前语音助手请求过于频繁，已达到限额，请稍等一分钟后再试。");
    } else {
      onSpeak("抱歉，我目前遇到了一些网络或者理解上的问题。");
    }
  }
}
