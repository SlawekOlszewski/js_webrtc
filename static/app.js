const room = prompt("Enter room name:");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const cameraSelection = document.getElementById("cameraSelection");
const audioInSelection = document.getElementById("audioInSelection");
const audioOutSelection = document.getElementById("audioOutSelection");
const mirrorCamera = document.getElementById("mirrorCamera");
const disableCamera = document.getElementById("disableCamera");
const mute = document.getElementById("mute");

const messages = document.getElementById("messages");
const messageBox = document.getElementById("messageBox");
const messageButton = document.getElementById("sendMessage");

let localStream;
let peerConnection;
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
const socket = io();

let localCameraMirror = false;
let remoteCameraMirror = false;
let cameraDisabled = false;
let muted = false;
let messagesArr = [];

function getVideoInputs() {
  return navigator.mediaDevices
    .enumerateDevices()
    .then((devices) =>
      devices.filter((device) => device.kind === "videoinput")
    );
}

function getAudioInputs() {
  return navigator.mediaDevices
    .enumerateDevices()
    .then((devices) =>
      devices.filter((device) => device.kind === "audioinput")
    );
}

function getAudioOutputs() {
  return navigator.mediaDevices
    .enumerateDevices()
    .then((devices) =>
      devices.filter((device) => device.kind === "audiooutput")
    );
}

getVideoInputs().then((videoInputs) => {
  videoInputs.forEach((device) => {
    let option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || `Camera ${cameraSelection.length + 1}`;
    cameraSelection.appendChild(option);
  });
});

getAudioInputs().then((audioInputs) => {
  audioInputs.forEach((device) => {
    let option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || `Microphone ${audioInSelection.length + 1}`;
    audioInSelection.appendChild(option);
  });
});

getAudioOutputs().then((audioOutputs) => {
  audioOutputs.forEach((device) => {
    let option = document.createElement("option");
    option.value = device.deviceId;
    option.text =
      device.label || `Audio Output ${audioOutSelection.length + 1}`;
    audioOutSelection.appendChild(option);
  });
});

function startVideoStream(
  cameraDeviceId,
  audioInDeviceId,
  cameraDisabled,
  muted
) {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  const constraints = {
    video: cameraDisabled
      ? false
      : { deviceId: cameraDeviceId ? { exact: cameraDeviceId } : undefined },
    audio: muted
      ? false
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: audioInDeviceId ? { exact: audioInDeviceId } : undefined,
        },
  };

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      localVideo.srcObject = stream;
      localStream = stream;
      if (peerConnection) {
        setupPeerConnection(stream);
      }
    })
    .catch((e) => console.error("getUserMedia Error: ", e));
}

let selectors = [cameraSelection, audioInSelection];

selectors.forEach((selector) =>
  selector.addEventListener("change", () => {
    startVideoStream(...selectors.map((s) => s.value), cameraDisabled, muted);
  })
);

mirrorCamera.addEventListener("click", () => {
  localCameraMirror = !localCameraMirror;
  socket.emit("mirror-camera", room, localCameraMirror);
  localCameraMirror
    ? localVideo.classList.add("mirrorVideo")
    : localVideo.classList.remove("mirrorVideo");
});

disableCamera.addEventListener("click", () => {
  cameraDisabled = !cameraDisabled;
  disableCamera.textContent = cameraDisabled
    ? "Enable Camera"
    : "Disable Camera";
  localStream.getTracks().forEach((track) => {
    if (track.readyState == "live" && track.kind == "video") {
      track.enabled = !cameraDisabled;
    }
  });
});

mute.addEventListener("click", () => {
  muted = !muted;
  mute.textContent = muted ? "Unmute" : "Mute";
  muted ? mute.classList.add("muted") : mute.classList.remove("muted");
  localStream.getTracks().forEach((track) => {
    if (track.readyState == "live" && track.kind == "audio") {
      track.enabled = !muted;
    }
  });
});

audioOutSelection.addEventListener("change", () => {
  if (typeof remoteVideo.sinkId !== "undefined") {
    remoteVideo.setSinkId(audioOutSelection.value);
  }
});

function addMessage(type, value, time) {
  styles = {
    local: "localMessage",
    remote: "remoteMessage",
  };
  const message = document.createElement("p");
  message.classList.add(styles[type]);
  message.textContent = value;
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

document.addEventListener("keyup", function (event) {
  if (event.key === "Enter") {
    messageButton.click();
  }
});

messageButton.addEventListener("click", () => {
  let type = "local";
  let value = messageBox.value;
  let time = new Date().toString();
  messagesArr.push({
    type: type,
    value: value,
    time: time,
  });
  addMessage(type, value, time);
  socket.emit("message", room, value);
  messageBox.value = "";
});

function setupPeerConnection(stream) {
  peerConnection = new RTCPeerConnection(configuration);

  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", room, event.candidate);
    }
  };

  peerConnection.oniceconnectionstatechange = function () {
    switch (peerConnection.iceConnectionState) {
      case "closed": // This means connection is shut down and no longer handling requests.
        // hangUpCall(); //Hangup instead of closevideo() because we want to record call end in db
        console.log("hangUpCalls");
        break;
      case "failed":
        checkStatePermanent("failed");
        break;
      case "disconnected":
        checkStatePermanent("disconnected");
        break;
    }
  };

  async function isPermanentDisconnect() {
    var isPermanentDisconnectFlag = false;
    var videoIsAlive = false;
    var audioIsAlive = false;

    await peerConnection.getStats(null).then((stats) => {
      stats.forEach((report) => {
        if (
          report.type === "inbound-rtp" &&
          (report.kind === "audio" || report.kind === "video")
        ) {
          //check for inbound data only
          if (report.kind === "audio") {
            //Here we must compare previous data count with current
            if (report.bytesReceived > audioReceivedByteCount) {
              // If current count is greater than previous then that means data is flowing to other peer. So this disconnected or failed ICE state is temporary
              audioIsAlive = true;
            } else {
              audioIsAlive = false;
            }
            audioReceivedByteCount = report.bytesReceived;
          }
          if (report.kind === "video") {
            if (report.bytesReceived > videoReceivedBytetCount) {
              // If current count is greater than previous then that means data is flowing to other peer. So this disconnected or failed ICE state is temporary
              videoIsAlive = true;
            } else {
              videoIsAlive = false;
            }
            videoReceivedBytetCount = report.bytesReceived;
          }
          if (audioIsAlive || videoIsAlive) {
            //either audio or video is being recieved.
            isPermanentDisconnectFlag = false; //Disconnected is temp
          } else {
            isPermanentDisconnectFlag = true;
          }
        }
      });
    });

    return isPermanentDisconnectFlag;
  }

  const customdelay = (ms) => new Promise((res) => setTimeout(res, ms));

  async function checkStatePermanent(iceState) {
    videoReceivedBytetCount = 0;
    audioReceivedByteCount = 0;

    let firstFlag = await isPermanentDisconnect();

    await customdelay(2000);

    let secondFlag = await isPermanentDisconnect(); //Call this func again after 2 seconds to check whether data is still coming in.

    if (secondFlag) {
      //If permanent disconnect then we hangup i.e no audio/video is fllowing
      if (iceState == "disconnected") {
        // hangUpCall(); //Hangup instead of closevideo() because we want to record call end in db
        console.log("hangUpCalls");
      }
    }
    if (!secondFlag) {
      //If temp failure then restart ice i.e audio/video is still flowing
      if (iceState == "failed") {
        peerConnection.restartIce();
      }
    }
  }

  peerConnection
    .createOffer()
    .then((offer) => peerConnection.setLocalDescription(offer))
    .then(() => socket.emit("offer", room, peerConnection.localDescription))
    .catch((e) => console.error(e));

  socket.on("offer", (offer, senderSocketId) => {
    if (socket.id != senderSocketId) {
      peerConnection
        .setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peerConnection.createAnswer())
        .then((answer) => peerConnection.setLocalDescription(answer))
        .then(() =>
          socket.emit("answer", room, peerConnection.localDescription)
        );
    }
  });

  socket.on("answer", (answer, senderSocketId) => {
    if (socket.id != senderSocketId) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  socket.on("ice-candidate", (candidate) => {
    socket.emit("mirror-camera", room, localCameraMirror);
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });

  socket.on("mirror-camera", (mirror) => {
    remoteCameraMirror = mirror;
    remoteCameraMirror
      ? remoteVideo.classList.add("mirrorVideo")
      : remoteVideo.classList.remove("mirrorVideo");
  });

  socket.on("message", (message) => {
    time = new Date().toString();
    addMessage("remote", message, time);
    messagesArr.push({
      type: "remote",
      value: message,
      time: time,
    });
  });
}

socket.on("connect", () => {
  console.log("Connected to signaling server");
  resetConnection(); // Reset any existing connection
  socket.emit("join room", room); // Rejoin the room
  startVideoStream(); // Restart video stream
  // Initialize or reinitialize WebRTC connection setup here
  setupPeerConnection(localStream);
});

socket.on("close", () => {
  resetConnection();
});

function resetConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
}

// Call resetConnection() before creating a new connection or on page unload
window.addEventListener("beforeunload", resetConnection);
