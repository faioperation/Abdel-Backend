import VapiModule from "./vendor/vapi-bundle.js";

const Vapi = VapiModule.default ?? VapiModule;

const CALL_TIMEOUT_SECONDS = 60;

const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const accessTokenInput = document.getElementById("accessToken");
const agentSelect = document.getElementById("agentSelect");
const statusPanel = document.getElementById("statusPanel");
const statusText = document.getElementById("statusText");
const refreshBtn = document.getElementById("refreshBtn");
const voiceBtn = document.getElementById("voiceBtn");

let vapiClient = null;
let isInCall = false;
let isConnecting = false;

const getApiBaseUrl = () => apiBaseUrlInput.value.replace(/\/$/, "");
const getToken = () => accessTokenInput.value.trim();

const setStatus = (message, type = "default") => {
  statusText.textContent = message;
  statusPanel.classList.remove("active", "error");

  if (type === "active") {
    statusPanel.classList.add("active");
  }

  if (type === "error") {
    statusPanel.classList.add("error");
  }
};

const apiRequest = async (path, options = {}) => {
  const token = getToken();

  if (!token) {
    throw new Error("Please paste your access token first.");
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Server returned an invalid response.");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Request failed");
  }

  return payload.data;
};

const updateVoiceButton = () => {
  const hasAgent = Boolean(agentSelect.value);

  if (isConnecting) {
    voiceBtn.disabled = true;
    voiceBtn.classList.remove("in-call");
    voiceBtn.innerHTML = "<span aria-hidden='true'>⏳</span> Connecting...";
    return;
  }

  if (isInCall) {
    voiceBtn.disabled = false;
    voiceBtn.classList.add("in-call");
    voiceBtn.innerHTML = "<span aria-hidden='true'>⏹️</span> End Call";
    return;
  }

  voiceBtn.classList.remove("in-call");
  voiceBtn.innerHTML = "<span aria-hidden='true'>🎤</span> Voice";
  voiceBtn.disabled = !hasAgent;
};

const loadAgents = async () => {
  try {
    setStatus("Loading agents...");
    const agents = await apiRequest("/api/business-owner/test-agent/agents");

    agentSelect.innerHTML = '<option value="">-- Choose an Agent --</option>';

    agents.forEach((agent) => {
      const option = document.createElement("option");
      option.value = agent.id;
      option.textContent = agent.agentName;
      agentSelect.appendChild(option);
    });

    if (agents.length === 0) {
      setStatus("No active agents found. Create one in AI Training first.");
      return;
    }

    setStatus("Select an agent and click Voice to start a call.");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    updateVoiceButton();
  }
};

const cleanupVapi = () => {
  if (vapiClient) {
    try {
      vapiClient.stop();
    } catch {
      // Ignore stop errors when the call is already closed.
    }
    vapiClient = null;
  }

  isInCall = false;
  isConnecting = false;
  updateVoiceButton();
};

const formatStage = (stage) => stage.replace(/-/g, " ");

const waitForVapiCallStart = (vapi, agentName) =>
  new Promise((resolve, reject) => {
    const timeoutMs = (CALL_TIMEOUT_SECONDS + 15) * 1000;

    const timeoutId = setTimeout(() => {
      cleanupListeners();
      reject(
        new Error(
          "Call connection timed out. Allow microphone access when prompted, then try again.",
        ),
      );
    }, timeoutMs);

    const cleanupListeners = () => {
      clearTimeout(timeoutId);
      vapi.off("call-start", handleCallStart);
      vapi.off("call-start-failed", handleCallStartFailed);
      vapi.off("call-start-success", handleCallStartSuccess);
      vapi.off("call-end", handleCallEnd);
      vapi.off("error", handleError);
      vapi.off("message", handleMessage);
      vapi.off("call-start-progress", handleProgress);
    };

    const handleCallStart = () => {
      cleanupListeners();
      resolve();
    };

    const handleCallStartSuccess = () => {
      cleanupListeners();
      resolve();
    };

    const handleCallStartFailed = (event) => {
      cleanupListeners();
      reject(new Error(event?.error || "Failed to start Vapi call"));
    };

    const handleCallEnd = () => {
      if (!isConnecting) {
        return;
      }

      cleanupListeners();
      reject(
        new Error(
          "Call ended before connection completed. Allow microphone access and try again.",
        ),
      );
    };

    const handleError = (error) => {
      if (!isConnecting) {
        return;
      }

      const message =
        error?.error?.message ||
        error?.message ||
        error?.type ||
        "Vapi call error";

      cleanupListeners();
      reject(new Error(message));
    };

    const handleMessage = (message) => {
      if (message?.type === "status-update" && message?.status === "ended") {
        const endedReason = message?.endedReason || "unknown";

        if (isConnecting) {
          cleanupListeners();
          reject(
            new Error(
              `Call ended early (${endedReason}). Allow microphone access and try again.`,
            ),
          );
        }
      }

      if (message?.type === "transcript" && message?.transcript) {
        setStatus(`${message.role}: ${message.transcript}`, "active");
      }
    };

    const handleProgress = (event) => {
      if (!event?.stage) {
        return;
      }

      const stageLabel = formatStage(event.stage);
      setStatus(`Connecting (${stageLabel})...`);

      if (
        event.stage === "daily-call-join" &&
        event.status === "completed"
      ) {
        setStatus(`Connected to ${agentName}. Waiting for assistant...`, "active");
      }
    };

    vapi.on("call-start", handleCallStart);
    vapi.on("call-start-success", handleCallStartSuccess);
    vapi.on("call-start-failed", handleCallStartFailed);
    vapi.on("call-end", handleCallEnd);
    vapi.on("error", handleError);
    vapi.on("message", handleMessage);
    vapi.on("call-start-progress", handleProgress);
  });

const startCall = async () => {
  const agentId = agentSelect.value;

  if (!agentId || isConnecting || isInCall) {
    if (!agentId) {
      setStatus("Please choose an agent first.", "error");
    }
    return;
  }

  isConnecting = true;
  updateVoiceButton();

  try {
    setStatus("Preparing call...");
    const callConfig = await apiRequest("/api/business-owner/test-agent/call", {
      method: "POST",
      body: JSON.stringify({ agentId }),
    });

    vapiClient = new Vapi(
      callConfig.vapiPublicKey,
      undefined,
      { alwaysIncludeMicInPermissionPrompt: true },
      { audioSource: true, startAudioOff: false },
    );

    if (typeof vapiClient?.start !== "function") {
      throw new Error("Vapi SDK failed to load. Hard refresh the page and try again.");
    }

    vapiClient.on("call-end", () => {
      cleanupVapi();
      setStatus("Call ended.");
    });

    setStatus(`Joining call with ${callConfig.agentName}...`);

    const assistantOverrides = {
      customerJoinTimeoutSeconds: CALL_TIMEOUT_SECONDS,
    };

    const startPromise = waitForVapiCallStart(
      vapiClient,
      callConfig.agentName,
    );

    const startResult = vapiClient.start(
      callConfig.vapiAssistantId,
      assistantOverrides,
    );

    await Promise.all([startPromise, startResult]);

    isConnecting = false;
    isInCall = true;
    updateVoiceButton();
    setStatus(
      `In call with ${callConfig.agentName}. Speak into your microphone.`,
      "active",
    );
  } catch (error) {
    cleanupVapi();
    setStatus(error.message, "error");
  }
};

const endCall = () => {
  setStatus("Ending call...");
  cleanupVapi();
  setStatus("Call ended.");
};

agentSelect.addEventListener("change", updateVoiceButton);
refreshBtn.addEventListener("click", loadAgents);

voiceBtn.addEventListener("click", () => {
  if (isInCall) {
    endCall();
    return;
  }

  startCall();
});

accessTokenInput.addEventListener("change", () => {
  localStorage.setItem("testAgentAccessToken", getToken());
});

apiBaseUrlInput.addEventListener("change", () => {
  localStorage.setItem("testAgentApiBaseUrl", getApiBaseUrl());
});

const savedToken = localStorage.getItem("testAgentAccessToken");
const savedApiBaseUrl = localStorage.getItem("testAgentApiBaseUrl");

if (savedToken) {
  accessTokenInput.value = savedToken;
}

if (savedApiBaseUrl) {
  apiBaseUrlInput.value = savedApiBaseUrl;
}

updateVoiceButton();
