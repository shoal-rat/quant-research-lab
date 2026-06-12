import { Bubble2DType } from "../../lib/office2d/agentMovement";

const bubbleFrames: Record<Bubble2DType, string> = {
  normal: "/assets/generated/ui/bubbles-2d/bubble-normal.png",
  thought: "/assets/generated/ui/bubbles-2d/bubble-thought.png",
  whisper: "/assets/generated/ui/bubbles-2d/bubble-whisper.png",
  shout: "/assets/generated/ui/bubbles-2d/bubble-shout.png",
  explosion: "/assets/generated/ui/bubbles-2d/bubble-explosion.png",
  sweat: "/assets/generated/ui/bubbles-2d/bubble-sweat.png",
  debate: "/assets/generated/ui/bubbles-2d/bubble-debate.png",
  system: "/assets/generated/ui/bubbles-2d/bubble-system.png"
};

export function SpeechBubble2D({ message, type }: { message: string; type: Bubble2DType }): JSX.Element {
  return (
    <div className={`speech-bubble-2d bubble-${type}`} data-bubble-tone={type}>
      <img className="bubble-frame" src={bubbleFrames[type]} alt="" aria-hidden="true" draggable={false} />
      <span className="bubble-safe">
        <em>{message}</em>
      </span>
    </div>
  );
}
