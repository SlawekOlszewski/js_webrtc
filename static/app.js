const room = prompt("Enter room name:");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const cameraSelection = document.getElementById("cameraSelection");
const audioInSelection = document.getElementById("audioInSelection");
const audioOutSelection = document.getElementById("audioOutSelection");
let localStream;
let peerConnection;
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
const socket = io();

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

function startVideoStream(cameraDeviceId, audioInDeviceId) {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  const constraints = {
    video: { deviceId: cameraDeviceId ? { exact: cameraDeviceId } : undefined },
    audio: {
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
    startVideoStream(...selectors.map((s) => s.value));
  })
);

audioOutSelection.addEventListener("change", () => {
  if (typeof remoteVideo.sinkId !== "undefined") {
    remoteVideo.setSinkId(audioOutSelection.value);
  }
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
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
