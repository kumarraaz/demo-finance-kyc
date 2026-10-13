"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useJourney } from "@/components/journey/JourneyProvider";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { CAMERA_PROBLEM_TEXT, cameraAllowedByPolicy, cameraSupported, classifyCameraError, openFrontCamera, stopStream, type CameraProblem } from "@/lib/journey/camera";
import { consumeStart, getImageUrl, setImageUrl } from "@/lib/journey/liveness-session";

type Phase = "idle" | "starting" | "live" | "captured" | "problem";

export default function LivenessCapturePage() {
  // Without consent there is no reason to be here: send people back to the introduction.
  return <StepGate step="liveness" requires={(d) => d.liveness.consent} redirectTo="/apply/liveness">{() => <Capture />}</StepGate>;
}

function Capture() {
  const router = useRouter();
  const { update } = useJourney();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>(() => (getImageUrl() ? "captured" : "idle"));
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [photo, setPhoto] = useState<string | null>(() => getImageUrl());
  const [live, setLive] = useState("");

  const release = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  async function startCamera() {
    setProblem(null);
    if (!cameraSupported()) {
      setProblem("unsupported");
      setPhase("problem");
      return;
    }
    if (!cameraAllowedByPolicy()) {
      setProblem("policy");
      setPhase("problem");
      return;
    }
    setPhase("starting");
    setLive("Starting the camera…");
    try {
      const stream = await openFrontCamera();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopStream(stream);
        return;
      }
      video.srcObject = stream;
      await video.play();
      setPhase("live");
      setLive("Camera ready. Centre your face in the oval, then press Capture photo.");
    } catch (e) {
      release();
      setProblem(classifyCameraError(e));
      setPhase("problem");
      setLive("The camera could not be started.");
    }
  }

  // Ask for the camera at once only when the person pressed Start Verification on the previous screen.
  useEffect(() => {
    const auto = consumeStart() && !getImageUrl();
    const timer = auto ? window.setTimeout(() => void startCamera(), 0) : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      release(); // stop every track when this screen closes
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) {
      setProblem("unknown");
      setPhase("problem");
      return;
    }
    const url = URL.createObjectURL(blob);
    setImageUrl(url); // memory only
    setPhoto(url);
    release();
    setPhase("captured");
    setLive("Photo captured. Review it, then continue or retake.");
    await update((d) => ({ ...d, liveness: { ...d.liveness, captured: true, source: "camera", capturedAt: new Date().toISOString(), result: undefined } }));
  }

  async function retake() {
    setImageUrl(null);
    setPhoto(null);
    await update((d) => ({ ...d, liveness: { ...d.liveness, captured: false, source: "", capturedAt: undefined, result: undefined } }));
    await startCamera();
  }

  async function usePlaceholder() {
    release();
    setImageUrl(null);
    setPhoto(null);
    await update((d) => ({ ...d, liveness: { ...d.liveness, captured: true, source: "placeholder", capturedAt: new Date().toISOString(), result: undefined } }));
    router.push("/apply/liveness/result");
  }

  const text = problem ? CAMERA_PROBLEM_TEXT[problem] : null;

  return (
    <StepFrame
      step="liveness"
      title="Liveness Check"
      subtitle="Take one clear photo of your face."
      stepLabel="Liveness Check: camera"
      back={{ label: "Back", onClick: () => { release(); router.push("/apply/liveness"); } }}
      primary={
        phase === "captured"
          ? { label: "Continue", onClick: () => router.push("/apply/liveness/result") }
          : phase === "live"
            ? { label: "Capture photo", onClick: capture, icon: <Icon name="camera" size={18} /> }
            : { label: phase === "starting" ? "Starting camera…" : "Start camera", onClick: startCamera, disabled: phase === "starting", busy: phase === "starting", icon: <Icon name="camera" size={18} /> }
      }
      secondary={phase === "captured" ? { label: "Retake", onClick: retake, icon: <Icon name="refresh" size={18} /> } : undefined}
    >
      <DemoNotice>Your photo stays on this device. Nothing is uploaded or compared in the demo.</DemoNotice>

      <section className="cj-card" aria-label="Camera">
        <div className="cj-camera">
          {/* The <video> stays mounted so the stream can attach; it is hidden unless live. */}
          <video ref={videoRef} playsInline muted aria-label="Live camera preview" hidden={phase !== "live"} />
          {phase === "live" && <div className="cj-oval" aria-hidden="true" />}
          {/* A blob: URL of an in-memory photo: next/image cannot optimise it, so a plain <img> is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {phase === "captured" && photo && <img src={photo} alt="Your captured photo (kept in memory only)" />}
          {phase === "captured" && !photo && <div className="cj-camera-msg"><Icon name="checkCircle" size={36} /><p>Simulated capture selected. No photo was taken.</p></div>}
          {phase === "idle" && (
            <div className="cj-camera-msg">
              <Icon name="camera" size={36} />
              <p>Press <strong>Start camera</strong>. Your browser will ask for permission.</p>
            </div>
          )}
          {phase === "starting" && (
            <div className="cj-camera-msg" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Starting the camera… allow access if your browser asks.</p>
            </div>
          )}
          {phase === "problem" && text && (
            <div className="cj-camera-msg" role="alert">
              <Icon name="alert" size={36} />
              <strong>{text.title}</strong>
              <p>{text.body}</p>
            </div>
          )}
        </div>
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
      </section>

      {phase === "problem" && (
        <section className="cj-card" aria-labelledby="alt-title">
          <h2 id="alt-title">What you can do</h2>
          <div className="cj-actions">
            {problem === "policy" ? (
              <button type="button" className="cj-btn cj-btn-secondary" onClick={() => window.location.reload()}><Icon name="refresh" size={18} />Reload this page</button>
            ) : (
              <button type="button" className="cj-btn cj-btn-secondary" onClick={startCamera}><Icon name="refresh" size={18} />Try the camera again</button>
            )}
            <button type="button" className="cj-btn cj-btn-secondary" onClick={usePlaceholder}>Use the simulated placeholder instead</button>
          </div>
          <Notice tone="demo" title="Simulated option">
            The placeholder takes no photo and is clearly marked as simulated on the next screen. A real deployment would require a real capture.
          </Notice>
        </section>
      )}
      {phase === "idle" && (
        <p className="cj-muted small">
          No camera, or prefer not to use it? <button type="button" className="cj-linkbtn" onClick={usePlaceholder}>Use the simulated placeholder</button> (demo only).
        </p>
      )}
    </StepFrame>
  );
}
