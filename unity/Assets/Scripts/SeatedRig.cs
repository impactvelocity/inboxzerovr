using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR;
using CommonUsages = UnityEngine.XR.CommonUsages;
using InputDevice = UnityEngine.XR.InputDevice;

namespace InboxZero
{
    /// The player's seat. Its child camera is the head.
    ///
    /// In a headset the camera follows the head and the whole rig is raised
    /// or lowered so the eyes sit at SeatedEyeHeight, whether the person is on
    /// a chair, a sofa or standing. If they change posture and hold it, the view
    /// eases to the new height. On a monitor the camera just sits at that height.
    public class SeatedRig : MonoBehaviour
    {
        /// Eye height, in metres above the arena floor, the scene is built for.
        public const float SeatedEyeHeight = 1.15f;

        public Camera head;

        bool calibrated, easing;
        float offTimer;
        int settle;

        public static bool InHeadset => XRSettings.isDeviceActive;
        /// Which way the head faces on a monitor. Straight ahead, unless the dev view turns it.
        public static Quaternion DeskLook = Quaternion.identity;

        static readonly List<XRInputSubsystem> inputs = new List<XRInputSubsystem>();

        void Awake()
        {
            if (head == null || head.GetComponent<TrackedPoseDriver>() != null) return;
            // The camera follows the headset. Without a headset this does nothing.
            var driver = head.gameObject.AddComponent<TrackedPoseDriver>();
            driver.enabled = false;
            driver.trackingType = TrackedPoseDriver.TrackingType.RotationAndPosition;
            driver.updateType = TrackedPoseDriver.UpdateType.UpdateAndBeforeRender;
            driver.ignoreTrackingState = true;
            driver.positionInput = new InputActionProperty(new InputAction("Head Position",
                InputActionType.Value, "<XRHMD>/centerEyePosition", expectedControlType: "Vector3"));
            driver.rotationInput = new InputActionProperty(new InputAction("Head Rotation",
                InputActionType.Value, "<XRHMD>/centerEyeRotation", expectedControlType: "Quaternion"));
            driver.enabled = true;
        }

        /// True once the headset reports a real head position.
        static bool HeadTracked()
        {
            var device = InputDevices.GetDeviceAtXRNode(XRNode.CenterEye);
            if (!device.isValid) device = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            return device.isValid && device.TryGetFeatureValue(CommonUsages.isTracked, out bool tracked) && tracked;
        }

        void Update()
        {
            if (head == null) return;
            var seat = transform.position;
            if (!InHeadset)
            {
                calibrated = easing = false;
                settle = 0;
                seat.y = 0;
                transform.position = seat;
                head.transform.localPosition = new Vector3(0, SeatedEyeHeight, 0);
                head.transform.localRotation = DeskLook;
                return;
            }
            if (!calibrated)
            {
                if (!HeadTracked()) return; // no head pose yet
                // Ask for heights measured from the floor. The seat works from any
                // origin, since only the head's height above the arena matters.
                SubsystemManager.GetSubsystems(inputs);
                foreach (var input in inputs) input.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor);
                if (++settle < 10) return; // let the new origin and the first poses arrive
            }
            float headY = head.transform.localPosition.y; // above the real floor
            float target = SeatedEyeHeight - headY;
            if (!calibrated)
            {
                seat.y = target;
                transform.position = seat;
                calibrated = true;
                return;
            }
            float error = target - seat.y;
            if (easing)
            {
                seat.y += error * (1 - Mathf.Exp(-3 * Time.deltaTime));
                transform.position = seat;
                if (Mathf.Abs(error) < 0.02f) easing = false;
                return;
            }
            // Leaning and reaching are play; only a held change of posture re-seats.
            offTimer = Mathf.Abs(error) > 0.22f ? offTimer + Time.deltaTime : 0;
            if (offTimer > 1.5f) { offTimer = 0; easing = true; }
        }
    }
}
