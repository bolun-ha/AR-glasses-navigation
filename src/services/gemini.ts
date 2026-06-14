import { FunctionDeclaration, GoogleGenAI, Type, FunctionCall } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
}

const searchNearbyFunctionDeclaration: FunctionDeclaration = {
  name: "searchNearby",
  description: "Search for nearby places based on a query (e.g., 'McDonalds', 'gas station', 'rest stop'). Returns a list of nearby places with their place IDs and distances.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "What to search for" },
    },
    required: ["query"],
  },
};

const setDestinationFunctionDeclaration: FunctionDeclaration = {
  name: "setDestination",
  description: "Set the final navigation destination. Use this if the user wants to change their ultimate destination.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      placeId: { type: Type.STRING, description: "The Map place ID of the destination." },
      name: { type: Type.STRING, description: "The name of the destination." },
    },
    required: ["placeId", "name"],
  },
};

const addWaypointFunctionDeclaration: FunctionDeclaration = {
  name: "addWaypoint",
  description: "Add a stop (waypoint) to the current route. Use this if the user wants to go somewhere along the way without changing their final destination.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      placeId: { type: Type.STRING, description: "The Map place ID of the waypoint." },
      name: { type: Type.STRING, description: "The name of the waypoint." },
    },
    required: ["placeId", "name"],
  },
};

let conversationHistory: any[] = [];

export async function processVoiceCommand(
  requestText: string,
  currentLocationCoords: string | null,
  currentDestinationName: string | null,
  callbacks: ToolsCallbacks,
  onSpeak: (message: string) => void
) {
  try {
    const systemInstruction = `You are a helpful voice navigation assistant.
The user is currently at coordinates: ${currentLocationCoords || 'Unknown'}.
Current destination: ${currentDestinationName || 'None'}.

When the user asks for places (e.g. "Nearest McDonalds"), immediately use the searchNearby tool to find out what's close.
Based on the results, you should verbally tell the user what you found and ask what they want to do.
Keep your spoken responses (text) VERY brief and conversational, as they will be read aloud while the user is driving/riding.

When the user confirms a place to go to, use either setDestination or addWaypoint to update the route! Don't just say you will, actually call the function.`;

    const requestContent = {
      role: 'user',
      parts: [{ text: requestText }]
    };
    
    // Add to history
    conversationHistory.push(requestContent);

    // Initial Gemini request
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash", // Use latest gemini-3.5-flash model for higher performance and robust rate limits
      contents: conversationHistory,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [searchNearbyFunctionDeclaration, setDestinationFunctionDeclaration, addWaypointFunctionDeclaration] }]
      },
    });

    // Add model request to history
    conversationHistory.push(response.candidates![0].content);

    let functionCalls = response.functionCalls;
    let currentResponse = response;

    while (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      let functionResponseData: any = { success: true };

      if (call.name === "searchNearby") {
        const query = (call.args as any).query;
        onSpeak("我在帮你找附近的结果，请稍等...");
        const results = await callbacks.onSearchNearby(query);
        functionResponseData = { results };
      } else if (call.name === "setDestination") {
        const { placeId, name } = call.args as any;
        callbacks.onSetDestination(placeId, name);
        functionResponseData = { success: true, message: `Destination set to ${name}` };
      } else if (call.name === "addWaypoint") {
        const { placeId, name } = call.args as any;
        callbacks.onAddWaypoint(placeId, name);
        functionResponseData = { success: true, message: `Waypoint ${name} added` };
      }

      // Append tool response
      const toolResponseParts = [{
        functionResponse: {
          name: call.name,
          response: functionResponseData
        }
      }];
      
      conversationHistory.push({ role: 'user', parts: toolResponseParts });

      // Call again with tool response
      currentResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: conversationHistory,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [searchNearbyFunctionDeclaration, setDestinationFunctionDeclaration, addWaypointFunctionDeclaration] }]
        },
      });

      conversationHistory.push(currentResponse.candidates![0].content);
      functionCalls = currentResponse.functionCalls;
    }

    // Now we have the final text response.
    let finalTxt = "";
    try {
      finalTxt = currentResponse.text || "";
    } catch (e) {
      console.warn("Could not get text from currentResponse directly", e);
      if (currentResponse.candidates && currentResponse.candidates.length > 0) {
         finalTxt = currentResponse.candidates[0].content.parts?.map((p: any) => p.text || "").join("") || "";
      }
    }

    if (finalTxt) {
      onSpeak(finalTxt);
    } else {
      // If there is no text after processing tools, we can just say complete
      onSpeak("我已经为您设置好了目的地。");
    }
  } catch (error) {
    console.error("Error processing voice command with Gemini:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    if (
      errMsg.includes("429") ||
      errMsg.includes("quota") ||
      errMsg.includes("RESOURCE_EXHAUSTED") ||
      errMsg.includes("Quota exceeded")
    ) {
      onSpeak("抱歉，当前的语音助手请求过于频繁，已达到免费额度限制，请稍等一分钟后再试。");
    } else {
      onSpeak("抱歉，我目前遇到了一些网络或者理解上的问题。");
    }
    // Remove last attempt from history if it failed completely
    conversationHistory.pop();
  }
}
