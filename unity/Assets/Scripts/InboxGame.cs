using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.XR;
using UnityEngine.XR.Hands;
using InputDevice = UnityEngine.XR.InputDevice;
using CommonUsages = UnityEngine.XR.CommonUsages;

namespace InboxZero
{
    /// Everything worth adjusting on a headset. Editable on the Game object.
    [Serializable]
    public class Tuning
    {
        public float swordSpeed = 1.0f;     // m/s the blade must be moving to cut
        public float hitDepth = 0.1f;       // the card's hit volume reaches this far in front and behind
        public float hitMargin = 0.03f;     // and this far past its edges
        public float weaponTiltDeg = 20;    // how far the weapon leans toward the fingers
        public float grabReach = 0.12f;     // a palm this close to the card can grab it
        public float pinchOn = 0.025f;      // thumb-to-index distance that closes a pinch
        public float pinchOff = 0.045f;     // and the distance that opens it again
        public float fistCurl = 0.09f;      // middle fingertip this close to the wrist is a fist
        public float pokeDepth = 0.025f;    // a fingertip this close to a button presses it
        public float swipeSpeed = 0.9f;     // m/s throw that sends a held card without letting go
        public float swipeTravel = 0.07f;   // the card must also have moved this far
        public float dropTravel = 0.13f;    // or: carry it this far and let go
        public float arriveSeconds = 1.1f;  // how long the next email takes to come out of the distance
        public float readSeconds = 5;       // then it waits this long, drifting closer, before it flies past
        public float approach = 0.12f;      // how far back it starts its wait, in metres
        public float passSeconds = 0.6f;    // how long flying past takes
        public float nextDelay = 0.12f;     // pause between one email and the next
        public float hitStop = 0.07f;       // the world holds its breath this long on a hit
        public float swingSeconds = 0.16f;  // the desktop saber's swing, from wind-up to follow-through
        public float driftSpeed = 5;        // m/s the stars drift past during a round
        public float cardDistance = 0.72f;  // how far in front of the chair the email floats
        public float introSeconds = 3;      // countdown before round 1
        public float intro2Seconds = 3;     // and before round 2
        public float doneSeconds = 8;       // summary on screen before going home
        public float replyHold = 3;         // seconds over a reply to send it
        public float micHold = 2;           // seconds over the mic to start dictating
        public float dictateSeconds = 2.6f; // how long the pretend dictation runs
        public bool gripToHit = false;      // the weapon only hits while the right hand is closed
        public int roundSize = 12;          // emails in round 1
        [Range(0, 1)] public float junkShare = 0.65f; // fraction of them that are junk
    }

    public enum Side { Left, Right }
    public enum CardState { Hidden, Arrive, Idle, Held, Return, Dictate, Pass }

    /// Inbox Zero: a seated, hands-first game. The rules are in Session; this is
    /// the body: the home screen, the card, the hands, the weapon, and all the
    /// feedback that makes a hit feel like a hit.
    ///
    ///   Home     the logo, a level picker and the big button.
    ///   Round 1  Review. Right hand holds the level's weapon: swing it through
    ///            an email to destroy it. Left hand grabs an email and throws
    ///            it away to keep.
    ///   Round 2  The work. Grab a kept email with either hand and lift it
    ///            onto a ready-made reply (3 s) or the mic (2 s) above it, or
    ///            throw it up past them to leave it for tomorrow.
    ///
    /// An email that is left alone for a few seconds flies on past and comes
    /// round again later, so nothing has to be decided in a hurry.
    ///
    /// Cards, text and buttons are on the UI layer and the saber on its own,
    /// so the screen effect (RetroFx) can keep them crisp while the world goes
    /// to pixels. Everything is within arm's reach of a chair. Keys work too
    /// (see Key). The world is Unity's: x right, y up, z forward, metres.
    public class InboxGame : MonoBehaviour
    {
        public Transform rig;       // the seat; hand poses are relative to it
        public Camera head;
        public Transform sword;     // the saber: handle along +Y, origin mid-grip
        public AudioSource speaker;
        public Tuning tuning = new Tuning();

        /// What the big button on the home screen says.
        public const string PlayWords = "CLEAR MY INBOX";

        // ------------------------------------------------------------ layout
        const float CardW = 0.5f, CardH = 0.3125f;
        /// Blade runs from here to here along the saber's +Y.
        public const float SwordBladeStart = 0.11f, SwordBladeEnd = 0.66f;
        /// The Kyoto katana at rest on a monitor. KatanaRest: where the middle of its grip
        /// falls in the picture (x, y from the lower left; outside 0..1 is off it) and how far
        /// out it is held, in metres at a 60 degree lens. KatanaAim: which way the blade
        /// points as the head sees it (right, up, away). KatanaTurn: its turn about its own
        /// length, in degrees.
        public static Vector3 KatanaRest = new Vector3(0.97f, -0.04f, 0.44f);
        public static Vector3 KatanaAim = new Vector3(-0.12f, 0.66f, 0.74f);
        public static float KatanaTurn = 110;      // spine toward the player, so the blade curves up toward its tip
        const int Mic = 2; // index into targets; 0 and 1 are the replies
        const int SwordSamples = 6, VoiceBars = 5, Faces = 3;
        const int Ui = RetroFx.UiLayer, World = 0;
        static readonly Vector3 IntroAt = new Vector3(0, SeatedRig.SeatedEyeHeight + 0.02f, 1.3f);

        static readonly string[] SliceWords = { "SLICED!", "ZAPPED!", "GONE!", "TRASHED!", "BYE!", "POOF!", "NOPE!" };
        static readonly string[] KeepWords = { "KEPT!", "SAVED!", "KEEPER!" };
        /// The cuts the desktop saber takes, in turn, across the card's face.
        static readonly Vector2[] SwingCuts =
        {
            new Vector2(-1, -0.55f), new Vector2(1, -0.45f), new Vector2(-1, 0.5f),
            new Vector2(0.4f, -1), new Vector2(1, 0.55f), new Vector2(-0.45f, -1),
        };

        Vector3 reviewHome, workHome, laterTarget, restHand;
        float homeZ, laterLine, hudY;
        struct Target { public Vector3 at; public float halfW, halfH; }
        Target[] targets;

        // ------------------------------------------------------------- parts
        class Label
        {
            public GameObject go;
            public Transform t;
            public Material material;
            public RenderTexture rt;
            public float width, height;
        }

        class HomeButton { public Label label; public string action; }

        // Joints are stored in XR Hands order (XRHandJointID.ToIndex()).
        const int JointCount = 26;
        const int Wrist = 0, ThumbTip = 5, IndexKnuckle = 7, IndexTip = 10,
            MiddleKnuckle = 12, MiddleTip = 15, LittleKnuckle = 22;

        class Hand
        {
            public Side side;
            public bool tracked, closed, trigger, triggerWas, poking;
            /// Finger joints in world space, when the bare hand is tracked.
            public bool hasJoints;
            public readonly Vector3[] joints = new Vector3[JointCount];
            public Vector3[] fakeJoints;
            // What the player sees of this hand.
            public GameObject visual, marker;
            public Transform[] dots, bones;
            public bool mustOpen;    // after a card leaves, the hand must open before it grabs again
            public Vector3 palm, prev, velocity;
            public Quaternion turn = Quaternion.identity;
            // Stand-in pose for checks and tools, used instead of a headset.
            public bool fake, fakeClosed;
            public Vector3 fakeAt;
            public Quaternion fakeTurn = Quaternion.identity;
        }

        readonly Session session = new Session();
        Sfx sfx;
        Painter painter;
        Transform stage; // parent of everything the game creates
        bool ready;
        float clock;
        Phase? dressed;  // the phase the scene is dressed for
        float phaseTimer;
        int countdown = -1;

        // Home screen.
        int levelIndex;
        readonly List<GameObject> homeParts = new List<GameObject>();
        readonly List<HomeButton> buttons = new List<HomeButton>();
        readonly List<HomeButton> tiles = new List<HomeButton>();
        HomeButton startButton, settingsButton;
        Transform logo;
        float logoY;

        // Text.
        Label intro, hints, pop, hud;
        float introPunch, popAge = 2, popTilt, goTimer, hudPunch;
        Vector3 popFrom;
        bool hintsForXR;
        readonly List<Color> marks = new List<Color>(); // what happened to each email this round

        // Light and motion.
        Transform flash;
        Material flashMaterial;
        Color flashColor;
        float flashAge = 1;
        IWorld space;
        readonly Dictionary<string, IWorld> worlds = new Dictionary<string, IWorld>();
        GameObject arena;      // the scene's platform, which belongs to the space levels
        RetroFx retro;
        Sparks sparks;
        HitFx hitFx;
        Boom boom;
        CardSplit split;
        BladeTrail trail;
        RetroFx screen; // null without the screen effect; every use is guarded
        float hitStop, fovKick, restFov, confetti;

        // Card.
        Transform card, cardGlow, cardAura, scroll, flyer;
        Mesh cardQuad, cardSheet; // a card of light is a quad; a letter is a sheet of paper
        Material cardMaterial, flyMaterial, cardGlowMaterial, cardAuraMaterial, scrollMaterial;
        readonly RenderTexture[] cardFaces = new RenderTexture[Faces];
        RenderTexture scrollFace;
        int activeFace;
        Color cardTint = Look.Cyan;
        CardState cardState = CardState.Hidden;
        float cardTimer, cardAge, landed = 1, scrollTime, flyAge = 1;
        float readTime, passScale = 1; // how long the card has waited; its size as it started to fly past
        int passSide = 1;              // which shoulder it flies past, turn about
        Vector3 cardHome, returnFrom, flyFrom, flyTarget, passFrom, grabFrom, swingAt;
        Quaternion passTurn = Quaternion.identity;
        bool pendingCard;
        float pendingTimer;

        // Round 2: replies, mic, hold progress.
        readonly List<Label> chips = new List<Label>();
        Label mic;
        readonly List<Transform> bars = new List<Transform>();
        readonly List<Transform> voice = new List<Transform>();
        int hover = -1;
        float hoverTime, dictateTimer;

        // Weapon and hands.
        bool weaponTracked;
        Transform saber, katana; // `sword` is whichever the level uses
        readonly Vector3[] samples = new Vector3[SwordSamples];
        readonly Vector3[] samplesPrev = new Vector3[SwordSamples];
        readonly List<Transform> bladeParts = new List<Transform>();
        readonly List<int> bladeAxis = new List<int>();
        float bladeOut, tipSpeed;
        Vector3 tipWas;
        // The desktop saber's swing: -1 at rest, else 0..1 through it.
        float swingT = -1, recover = 1;
        Vector2 swingCut;
        Quaternion swingFrame = Quaternion.identity, swingEndRot = Quaternion.identity;
        Vector3 swingEndPos;
        int swingCount;
        bool swingHit;
        readonly Hand left = new Hand { side = Side.Left };
        readonly Hand right = new Hand { side = Side.Right };
        Hand holder;
        Vector3 grabOffset;

        // The dev view (a monitor only): the scene on its own, to look around in.
        bool dev, devNight, devHints = true;
        float devYaw, devPitch;
        readonly List<GameObject> devHidden = new List<GameObject>();

        // ------------------------------------------- state, for tools and tests
        public bool Dev => dev;
        public Session Session => session;
        public Phase Phase => session.phase;
        public CardState Card => cardState;
        public Vector3 CardPosition => card.position;
        public Level Level => Levels.All[levelIndex];
        /// Where the big button and the first reply are, for tools and tests.
        public Vector3 StartAt => startButton.label.t.position;
        public Vector3 ReplyAt(int index) => targets[index].at;
        public Vector3 LevelTileAt(int index) => tiles[index].label.t.position;
        /// Send a shooting star across the sky ahead (for tools and tests; the
        /// sky sends its own every few seconds).
        public void ShootingStar() => space.Wish();
        /// Set before Init to keep the game silent (the playthrough check does).
        public bool startMuted;

        // ------------------------------------------------------------ Unity

        void Start() { Init(); }

        void Update()
        {
            if (!ready) return;
            var keyboard = Keyboard.current;
            if (keyboard != null && !SeatedRig.InHeadset
                && (keyboard.f1Key.wasPressedThisFrame || keyboard.backquoteKey.wasPressedThisFrame))
                SetDev(!dev);
            if (dev)
            {
                DevInput(keyboard, Mouse.current, Time.deltaTime);
                Step(Time.deltaTime);
                return;
            }
            if (keyboard != null)
            {
                foreach (var pair in Keys)
                {
                    if (keyboard[pair.Key].wasPressedThisFrame) Key(pair.Value);
                }
            }
            var mouse = Mouse.current;
            if (mouse != null && head != null && !SeatedRig.InHeadset && mouse.leftButton.wasPressedThisFrame)
                Click(head.ScreenPointToRay(mouse.position.ReadValue()));
            Step(Time.deltaTime);
        }

        static readonly Dictionary<Key, string> Keys = new Dictionary<Key, string>
        {
            { UnityEngine.InputSystem.Key.Space, "Space" }, { UnityEngine.InputSystem.Key.Enter, "Space" },
            { UnityEngine.InputSystem.Key.D, "Space" },
            { UnityEngine.InputSystem.Key.LeftArrow, "A" }, { UnityEngine.InputSystem.Key.A, "A" },
            { UnityEngine.InputSystem.Key.Digit1, "1" }, { UnityEngine.InputSystem.Key.Digit2, "2" },
            { UnityEngine.InputSystem.Key.M, "M" },
            { UnityEngine.InputSystem.Key.UpArrow, "W" }, { UnityEngine.InputSystem.Key.W, "W" },
        };

        // ---------------------------------------------------------- dev view

        /// The scene with no game in front of it: emails, buttons, labels, hands
        /// and the weapon are put away and the session stands still, while the
        /// world goes on moving. F1 or ` switches it on a monitor.
        ///   hold Space + mouse  look around (the arrow keys turn too)
        ///   N  dusk / night     H  hide the hint line     F1  back
        public void SetDev(bool on)
        {
            if (!ready || on == dev) return;
            dev = on;
            if (on)
            {
                devHidden.Clear();
                foreach (Transform child in stage)
                {
                    var go = child.gameObject;
                    if (go.name == "Space" || go.name == "Kyoto" || go == hints.go || !go.activeSelf) continue;
                    devHidden.Add(go);
                    go.SetActive(false);
                }
                if (saber && saber.gameObject.activeSelf)
                {
                    devHidden.Add(saber.gameObject);
                    saber.gameObject.SetActive(false);
                }
                sfx.Hum(false, 0);
                devNight = space is KyotoWorld kyoto && kyoto.Night > 0.5f;
                devHints = true;
                DrawDevHints();
            }
            else
            {
                foreach (var go in devHidden) if (go) go.SetActive(true);
                devHidden.Clear();
                if (space is KyotoWorld kyoto) kyoto.NightOverride = null;
                DevLook(0, 0);
                Cursor.lockState = CursorLockMode.None;
                DrawHints();
            }
        }

        /// Turn the head in the dev view: degrees to the right and upward.
        public void DevLook(float yaw, float pitch)
        {
            devYaw = Mathf.Repeat(yaw + 180, 360) - 180;
            devPitch = Mathf.Clamp(pitch, -80, 80);
            SeatedRig.DeskLook = Quaternion.Euler(-devPitch, devYaw, 0);
            if (head != null) head.transform.localRotation = SeatedRig.DeskLook;
        }

        void DrawDevHints()
        {
            hints.go.SetActive(devHints && head != null);
            if (!devHints) return;
            string time = space is KyotoWorld kyoto ? (devNight ? kyoto.EarlyName : kyoto.LateName) : "-";
            CardArt.Hints(painter, hints.rt, new[] { ("Space", "hold + mouse: look"), ("N", time), ("H", "hide"), ("F1", "back") });
        }

        void DevInput(Keyboard keyboard, Mouse mouse, float dt)
        {
            if (keyboard == null) return;
            bool looking = keyboard.spaceKey.isPressed;
            Cursor.lockState = looking ? CursorLockMode.Locked : CursorLockMode.None;
            float yaw = devYaw, pitch = devPitch;
            if (looking && mouse != null)
            {
                var move = mouse.delta.ReadValue();
                yaw += move.x * 0.12f;
                pitch += move.y * 0.12f;
            }
            float turn = 70 * dt;
            if (keyboard.leftArrowKey.isPressed) yaw -= turn;
            if (keyboard.rightArrowKey.isPressed) yaw += turn;
            if (keyboard.upArrowKey.isPressed) pitch += turn;
            if (keyboard.downArrowKey.isPressed) pitch -= turn;
            if (yaw != devYaw || pitch != devPitch) DevLook(yaw, pitch);
            if (keyboard.nKey.wasPressedThisFrame) { devNight = !devNight; DrawDevHints(); }
            if (keyboard.hKey.wasPressedThisFrame) { devHints = !devHints; DrawDevHints(); }
        }

        /// The dev view's frame: only the world moves.
        void DevStep(float dt)
        {
            clock += dt;
            if (space is KyotoWorld kyoto) kyoto.NightOverride = devNight ? 1 : 0;
            space.Round(false);
            space.Step(dt, tuning.driftSpeed * 0.3f, 0, 0);
            sfx.Step(dt);
            if (screen) screen.Tick(dt);
        }

        /// Desktop shortcuts. A headset has no keyboard.
        ///   Space  start / slash / skip a countdown     A  keep
        ///   1, 2   send that reply     M  dictate     W  tomorrow
        ///   F1 or `  the dev view (see SetDev)
        public void Key(string key)
        {
            var phase = session.phase;
            switch (key)
            {
                case "Space":
                    if (phase == Phase.Home) PressHome("start");
                    else if (phase == Phase.Review) Swing();
                    else phaseTimer = 0; // skip a countdown or the summary
                    break;
                case "A": DecideReview(ReviewAction.Keep, card.position, null, null); break;
                case "1": DecideWork(WorkAction.Reply, 0); break;
                case "2": DecideWork(WorkAction.Reply, 1); break;
                case "M": StartDictation(); break;
                case "W": DecideWork(WorkAction.Later, -1); break;
            }
        }

        /// A pointer (mouse, or a controller's trigger) pressed along this ray.
        public void Click(Ray ray)
        {
            if (session.phase != Phase.Home) return;
            foreach (var button in buttons)
            {
                var t = button.label.t;
                var plane = new Plane(-t.forward, t.position);
                if (!plane.Raycast(ray, out float distance)) continue;
                var local = t.InverseTransformPoint(ray.GetPoint(distance));
                if (Mathf.Abs(local.x) < button.label.width / 2 && Mathf.Abs(local.y) < button.label.height / 2)
                {
                    PressHome(button.action);
                    return;
                }
            }
        }

        // ------------------------------------------------------------- build

        public void Init()
        {
            if (ready) return;
            if (speaker == null) speaker = GetComponent<AudioSource>();
            sfx = new Sfx(speaker) { muted = startMuted };
            painter = new Painter();
            stage = new GameObject("Stage").transform;
            stage.SetParent(transform, false);

            // The email hangs at eye level in the middle of the view; round 2
            // sits it a little lower to make room for the replies above.
            float d = tuning.cardDistance, eye = SeatedRig.SeatedEyeHeight;
            reviewHome = new Vector3(0, eye - 0.02f, d);
            workHome = new Vector3(0, eye - 0.1f, d);
            float row = workHome.y + 0.28f;
            targets = new[]
            {
                new Target { at = new Vector3(-0.27f, row, d - 0.03f), halfW = 0.15f, halfH = 0.11f },
                new Target { at = new Vector3(0.27f, row, d - 0.03f), halfW = 0.15f, halfH = 0.11f },
                new Target { at = new Vector3(0, row + 0.01f, d - 0.03f), halfW = 0.1f, halfH = 0.11f },
            };
            laterLine = row + 0.19f; // carry or throw a card higher than this for tomorrow
            laterTarget = new Vector3(0, row + 0.6f, d + 0.18f);
            restHand = new Vector3(0.37f, eye - 0.42f, d - 0.3f);
            homeZ = d - 0.06f;
            hudY = eye + 0.33f;
            cardHome = reviewHome;

            arena = GameObject.Find("Arena");
            sparks = new Sparks(stage);
            hitFx = new HitFx(stage);
            boom = new Boom(stage);
            split = new CardSplit(stage);
            trail = new BladeTrail(stage, Level.accent, RetroFx.SaberLayer);
            if (head != null)
            {
                restFov = head.fieldOfView;
                retro = head.GetComponent<RetroFx>();
                screen = retro;
            }
            BuildCard();
            BuildFeedback();
            BuildHome();
            BuildWork();
            BuildHints();
            BuildHand(left);
            BuildHand(right);
            saber = sword;
            if (sword)
            {
                SetLayer(sword, RetroFx.SaberLayer);
                sword.gameObject.SetActive(false);
            }
            ApplyLevel();
            ready = true;
            SyncPhase();
        }

        /// Dress everything for the chosen level: the world around the seat,
        /// the screen treatment, the weapon, and what an email is made of.
        void ApplyLevel()
        {
            var level = Level;
            foreach (var other in worlds.Values) other.Show(false);
            string place = level.world + "/" + level.scene;
            if (!worlds.TryGetValue(place, out space))
            {
                float eye = SeatedRig.SeatedEyeHeight;
                space = level.world == "Kyoto" ? (IWorld)new KyotoWorld(stage, eye, level.scene ?? KyotoWorld.Garden) { Muted = startMuted } : new Starfield(stage, eye, level);
                worlds[place] = space;
            }
            space.Show(true);
            if (arena) arena.SetActive(level.world == "Space");
            if (retro) retro.enabled = level.retro;
            // Kyoto owns its URP atmosphere; the Retro world restores its camera treatment.
            if (head != null)
            {
                head.clearFlags = CameraClearFlags.Skybox;
                var painted = head.GetComponent<KyotoFx>();
                if (painted != null) painted.enabled = false;
                if (space is KyotoWorld komorebi) komorebi.ConfigureCamera(head);
                if (!UnityEngine.XR.XRSettings.isDeviceActive)
                    head.fieldOfView = space is KyotoWorld garden ? garden.DesktopFieldOfView : 70;
            }
            screen = level.retro ? retro : null;

            if (sword) sword.gameObject.SetActive(false);
            if (level.weaponModel != null && katana == null)
            {
                katana = KyotoWorld.Katana(stage, level.weaponModel, (int)UnityEngine.Rendering.RenderQueue.Transparent + 50);
                if (katana)
                {
                    SetLayer(katana, RetroFx.SaberLayer);
                    katana.gameObject.SetActive(false);
                }
            }
            sword = level.weaponModel != null && katana ? katana : saber;
            bladeParts.Clear();
            bladeAxis.Clear();
            FindBlade();
            trail.Tint = level.trail ?? level.accent;

            // A letter is the paper sheet with the email inked onto it; a card
            // of light is a flat quad. Both show the same Painter textures.
            if (level.paper && cardSheet == null) cardSheet = KyotoWorld.Letter();
            bool paper = level.paper && cardSheet != null;
            var shader = Look.Shader(level.paper ? "Ink" : "Holo");
            var washi = level.paper ? Resources.Load<Texture2D>("Kyoto/Letter_Washi") : null;
            foreach (var material in new[] { cardMaterial, flyMaterial, scrollMaterial, split.Material })
            {
                material.shader = shader;
                if (!level.paper) continue;
                material.SetFloat("_Paper", material == scrollMaterial ? 0 : 1);
                // The sheet is a closed shell: show only the side that faces the eye.
                bool shell = paper && (material == cardMaterial || material == flyMaterial);
                material.SetFloat("_Cull", (float)(shell ? UnityEngine.Rendering.CullMode.Back : UnityEngine.Rendering.CullMode.Off));
                if (washi) material.SetTexture("_PaperTex", washi);
            }
            card.GetComponent<MeshFilter>().sharedMesh = paper ? cardSheet : cardQuad;
            flyer.GetComponent<MeshFilter>().sharedMesh = paper ? cardSheet : cardQuad;
            cardGlow.gameObject.SetActive(!level.paper);
            cardAura.gameObject.SetActive(!level.paper);

            if (startButton != null) CardArt.Button(painter, startButton.label.rt, PlayWords, level.accent);
            if (tiles.Count > 0) DrawTiles();
        }

        static void SetLayer(Transform t, int layer)
        {
            t.gameObject.layer = layer;
            foreach (Transform child in t) SetLayer(child, layer);
        }

        Transform Spawn(string name, Mesh mesh, Material material, int layer = Ui)
        {
            var go = new GameObject(name) { layer = layer };
            go.transform.SetParent(stage, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return go.transform;
        }

        Label MakeLabel(string name, float width, float height, int pxW, int pxH)
        {
            var label = new Label { width = width, height = height, rt = Painter.NewTarget(pxW, pxH) };
            label.material = Look.Label(label.rt);
            label.t = Spawn(name, Look.Quad(width, height), label.material);
            label.go = label.t.gameObject;
            return label;
        }

        void BuildCard()
        {
            for (int i = 0; i < Faces; i++) cardFaces[i] = Painter.NewTarget(1024, 640);
            // The card and everything on it draw just before the rest of the UI,
            // so chips and labels always sit on top of it.
            cardMaterial = Look.Holo(cardFaces[0]);
            cardMaterial.renderQueue -= 2;
            cardQuad = Look.Quad(CardW, CardH);
            card = Spawn("EmailCard", cardQuad, cardMaterial);

            // Light around the card, in the colour of its type: a crisp glow
            // hugging the edge, and a faint aura behind. Both drawn before it.
            cardGlowMaterial = Look.Neon(Color.white, 0, 0, -3);
            cardGlow = Spawn("CardGlow", Look.NeonRoundRect(CardW / 2 - 0.004f, CardH / 2 - 0.004f, 0.011f, 0.012f, 0.022f), cardGlowMaterial);
            cardGlow.SetParent(card, false);
            cardGlow.localPosition = new Vector3(0, 0, 0.002f);
            cardAuraMaterial = Look.Neon(Color.white, 0, 0, -4);
            cardAura = Spawn("CardAura", Look.SoftDisc(1, 40, Color.white), cardAuraMaterial);
            cardAura.SetParent(card, false);
            cardAura.localPosition = new Vector3(0, 0, 0.004f);
            cardAura.localScale = new Vector3(0.52f, 0.37f, 1);

            // The window on a newsletter that scrolls through the mock email.
            scrollFace = Painter.NewTarget((int)CardArt.ScrollWindow.width, CardArt.ScrollHeight);
            scrollFace.wrapMode = TextureWrapMode.Repeat;
            scrollMaterial = Look.Holo(scrollFace);
            scrollMaterial.renderQueue -= 1;
            var win = CardArt.ScrollWindow;
            scrollMaterial.SetFloat("_Window", win.height / CardArt.ScrollHeight);
            scroll = Spawn("Scroll", Look.Quad(win.width / 1024 * CardW, win.height / 640 * CardH), scrollMaterial);
            scroll.SetParent(card, false);
            scroll.localPosition = new Vector3((win.x + win.width / 2) / 1024 * CardW - CardW / 2,
                CardH / 2 - (win.y + win.height / 2) / 640 * CardH, -0.0008f);
            card.gameObject.SetActive(false);

            // A kept or sent card flies off as a copy of itself.
            flyMaterial = Look.Holo(cardFaces[0]);
            flyer = Spawn("CardFlying", cardQuad, flyMaterial);
            flyer.gameObject.SetActive(false);
        }

        void BuildFeedback()
        {
            flashMaterial = Look.Neon(Look.Cyan);
            flash = Spawn("Flash", Look.SoftDisc(0.5f, 40, Color.white), flashMaterial, World);
            flash.gameObject.SetActive(false);

            pop = MakeLabel("Pop", 0.5f, 0.078f, 1024, 160);
            pop.material.renderQueue += 5; // over the card and the chips
            pop.go.SetActive(false);

            intro = MakeLabel("Countdown", 1.4f, 0.7f, 1024, 512);
            intro.t.position = IntroAt;
            intro.go.SetActive(false);

            hud = MakeLabel("RoundHud", 0.42f, 0.082f, 1024, 200);
            hud.go.SetActive(false);
        }

        /// A small logo, the level picker, the big button, and a gear in the corner.
        void BuildHome()
        {
            float eye = SeatedRig.SeatedEyeHeight;
            var image = Resources.Load<Texture2D>("Logo");
            logoY = eye + 0.15f;
            if (image != null)
            {
                float width = 0.3f, height = width * image.height / image.width;
                var material = new Material(Look.Shader("Logo")) { mainTexture = image };
                // An image without transparency of its own gets its white background removed.
                bool hasAlpha = UnityEngine.Experimental.Rendering.GraphicsFormatUtility.HasAlphaChannel(image.graphicsFormat);
                material.SetFloat("_KeyWhite", hasAlpha ? 0 : 1);
                logo = Spawn("Logo", Look.Quad(width, height), material);
            }
            else
            {
                var title = MakeLabel("Title", 0.3f, 0.06f, 1024, 205);
                CardArt.Label(painter, title.rt, "INBOX ZERO", Look.Text);
                logo = title.t;
            }
            logo.position = new Vector3(0, logoY, homeZ);
            homeParts.Add(logo.gameObject);

            // One chip per level. Only the ready ones can be picked.
            for (int i = 0; i < Levels.All.Length; i++)
            {
                var label = MakeLabel("Level-" + i, 0.15f, 0.15f * 160 / 512, 512, 160);
                label.t.position = new Vector3((i - (Levels.All.Length - 1) / 2f) * 0.162f, eye + 0.055f, homeZ);
                homeParts.Add(label.go);
                var tile = new HomeButton { label = label, action = "level:" + i };
                tiles.Add(tile);
                buttons.Add(tile);
            }
            DrawTiles();

            var start = MakeLabel("Home-start", 0.3f, 0.3f * 170 / 640, 640, 170);
            CardArt.Button(painter, start.rt, PlayWords, Level.accent);
            start.t.position = new Vector3(0, eye - 0.06f, homeZ);
            homeParts.Add(start.go);
            startButton = new HomeButton { label = start, action = "start" };
            buttons.Add(startButton);
            var halo = Spawn("StartGlow", Look.NeonRoundRect(0.15f - 0.004f, start.height / 2 - 0.006f, 0.008f, 0.01f, 0.035f),
                Look.Neon(new Color(Level.accent.r, Level.accent.g, Level.accent.b, 0.55f), 0, 0, -1));
            halo.SetParent(start.t, false);
            halo.localPosition = new Vector3(0, 0.002f, 0.002f);

            var gear = MakeLabel("Home-settings", 0.045f, 0.045f, 160, 160);
            CardArt.SettingsIcon(painter, gear.rt);
            gear.t.position = new Vector3(0.44f, eye - 0.24f, homeZ);
            homeParts.Add(gear.go);
            settingsButton = new HomeButton { label = gear, action = "settings" };
            buttons.Add(settingsButton);
        }

        void DrawTiles()
        {
            for (int i = 0; i < tiles.Count; i++)
                CardArt.LevelChip(painter, tiles[i].label.rt, Levels.All[i], i == levelIndex);
        }

        /// Round 2: two reply chips, the mic, hold bars and the voice meter.
        void BuildWork()
        {
            var barMaterial = Look.Glow(Look.Hex(0x5dffa1));
            for (int i = 0; i < targets.Length; i++)
            {
                var target = targets[i];
                var label = i == Mic
                    ? MakeLabel("Mic", 0.15f, 0.15f, 256, 256)
                    : MakeLabel("Reply" + i, 0.26f, 0.1f, 512, 200);
                label.t.position = target.at;
                label.go.SetActive(false);
                if (i == Mic) mic = label; else chips.Add(label);

                // A bar under the target that fills while a card is held over it.
                float width = i == Mic ? 0.13f : 0.24f;
                var bar = Spawn("HoldBar" + i, Look.Quad(width, 0.012f, pivotLeft: true), barMaterial);
                bar.position = new Vector3(target.at.x - width / 2, target.at.y - (i == Mic ? 0.088f : 0.064f), target.at.z - 0.002f);
                bar.gameObject.SetActive(false);
                bars.Add(bar);
            }
            CardArt.Mic(painter, mic.rt, false);

            // The voice meter sits just under the mic while it listens.
            var voiceMaterial = Look.Glow(Look.Coral);
            var micAt = targets[Mic].at;
            for (int i = 0; i < VoiceBars; i++)
            {
                var bar = Spawn("VoiceBar" + i, Look.Quad(0.012f, 0.04f), voiceMaterial);
                bar.position = new Vector3(micAt.x + (i - (VoiceBars - 1) / 2f) * 0.022f, micAt.y - 0.105f, micAt.z - 0.01f);
                bar.gameObject.SetActive(false);
                voice.Add(bar);
            }
        }

        /// Keyboard hints along the bottom of the screen. Not shown in a headset.
        void BuildHints()
        {
            hints = MakeLabel("KeyHints", 0.62f, 0.62f * 72 / 1400, 1400, 72);
            hints.material.renderQueue += 10; // over everything
            if (head != null)
            {
                hints.t.SetParent(head.transform, false);
                // Half a metre ahead, just above the bottom edge of the view.
                float down = Mathf.Tan(head.fieldOfView * 0.5f * Mathf.Deg2Rad) * 0.5f * 0.86f;
                hints.t.localPosition = new Vector3(0, -down, 0.5f);
            }
            hints.go.SetActive(false);
        }

        void DrawHints()
        {
            bool show = head != null && !InXR();
            hints.go.SetActive(show);
            if (!show) return;
            (string, string)[] keys;
            switch (session.phase)
            {
                case Phase.Home:
                    keys = new[] { ("Space", "clear my inbox") };
                    break;
                case Phase.Review:
                    keys = new[] { ("Space", "slash"), ("A", "keep") };
                    break;
                case Phase.Work:
                    keys = new[] { ("1", "left reply"), ("2", "right reply"), ("M", "dictate"), ("W", "tomorrow") };
                    break;
                default:
                    keys = new[] { ("Space", "skip") };
                    break;
            }
            CardArt.Hints(painter, hints.rt, keys);
        }

        /// The glowing parts of the saber, so the blade can slide out and flicker.
        void FindBlade()
        {
            if (!sword) return;
            foreach (Transform part in sword)
            {
                if (part.name != "Blade" && !part.name.StartsWith("Halo")) continue;
                // Which of the part's own axes runs along the blade.
                var along = Quaternion.Inverse(part.localRotation) * Vector3.up;
                int axis = Mathf.Abs(along.x) > Mathf.Abs(along.y)
                    ? (Mathf.Abs(along.x) > Mathf.Abs(along.z) ? 0 : 2)
                    : (Mathf.Abs(along.y) > Mathf.Abs(along.z) ? 1 : 2);
                bladeParts.Add(part);
                bladeAxis.Add(axis);
            }
        }

        /// A light skeleton for a tracked hand, and a dot for a controller.
        void BuildHand(Hand hand)
        {
            var skin = Look.Sheer(new Color(0.78f, 0.92f, 1f, 0.85f));
            var probe = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            var ball = probe.GetComponent<MeshFilter>().sharedMesh;
            Look.Kill(probe);
            probe = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var box = probe.GetComponent<MeshFilter>().sharedMesh;
            Look.Kill(probe);

            hand.visual = new GameObject(hand.side + "Hand");
            hand.visual.transform.SetParent(stage, false);
            hand.dots = new Transform[JointCount];
            hand.bones = new Transform[JointCount];
            for (int i = 0; i < JointCount; i++)
            {
                if (i == 1) continue; // the palm centre is not a knuckle
                hand.dots[i] = Spawn("Joint" + i, ball, skin);
                hand.dots[i].SetParent(hand.visual.transform, false);
                hand.dots[i].localScale = Vector3.one * (i == Wrist ? 0.02f : 0.013f);
                if (i == Wrist) continue;
                hand.bones[i] = Spawn("Bone" + i, box, skin);
                hand.bones[i].SetParent(hand.visual.transform, false);
            }
            hand.visual.SetActive(false);
            hand.marker = Spawn(hand.side + "Controller", ball, skin).gameObject;
            hand.marker.transform.localScale = Vector3.one * 0.035f;
            hand.marker.SetActive(false);
        }

        /// The joint each joint hangs from: fingers chain back to the wrist.
        static int JointParent(int joint) => joint == 2 || (joint >= 6 && (joint - 6) % 5 == 0) ? Wrist : joint - 1;

        void DrawHand(Hand hand)
        {
            bool skeleton = hand.tracked && hand.hasJoints;
            hand.visual.SetActive(skeleton);
            // The right controller is hidden in round 1: the weapon is there instead.
            bool armed = hand.side == Side.Right && (session.phase == Phase.Intro1 || session.phase == Phase.Review);
            hand.marker.SetActive(hand.tracked && !hand.hasJoints && !armed);
            if (hand.marker.activeSelf) hand.marker.transform.position = hand.palm;
            if (!skeleton) return;
            for (int i = 0; i < JointCount; i++)
            {
                if (hand.dots[i] == null) continue;
                hand.dots[i].position = hand.joints[i];
                if (hand.bones[i] == null) continue;
                Vector3 from = hand.joints[JointParent(i)], to = hand.joints[i];
                float length = (to - from).magnitude;
                hand.bones[i].gameObject.SetActive(length > 1e-4f);
                if (length <= 1e-4f) continue;
                hand.bones[i].SetPositionAndRotation((from + to) / 2, Quaternion.LookRotation(to - from));
                hand.bones[i].localScale = new Vector3(0.007f, 0.007f, length);
            }
        }

        // -------------------------------------------------------------- flow

        /// A headset is on, or a check is standing in for one.
        bool InXR() => left.fake || right.fake || SeatedRig.InHeadset;

        public void PressHome(string action)
        {
            if (session.phase != Phase.Home) return;
            if (action == "start")
            {
                uint seed = unchecked((uint)(DateTime.Now.Ticks ^ UnityEngine.Random.Range(0, int.MaxValue)));
                StartRound(seed);
            }
            else if (action.StartsWith("level:"))
            {
                int picked = int.Parse(action.Substring(6));
                if (!Levels.All[picked].ready)
                {
                    sfx.Blip(0.85f);
                    ShowPop("SOON!", Look.Text, Look.Hex(0x3a4a78), tiles[picked].label.t.position + new Vector3(0, 0.06f, -0.01f));
                    return;
                }
                levelIndex = picked;
                ApplyLevel();
                sfx.Blip(1.2f);
            }
            else
            {
                // Settings are not built yet.
                sfx.Blip(0.85f);
                ShowPop("SOON!", Look.Text, Look.Hex(0x3a4a78), settingsButton.label.t.position + new Vector3(-0.08f, 0.05f, -0.01f));
            }
        }

        /// Start with a chosen shuffle (the same seed deals the same emails).
        /// No sound here: the music coming in is the start of the level.
        public void StartRound(uint seed)
        {
            if (session.phase != Phase.Home) return;
            session.Start(seed, tuning.roundSize, tuning.junkShare);
            space.Kick(1);
            if (screen) { screen.Punch(0.5f); screen.Flash(Color.white, 0.2f); }
            SyncPhase();
        }

        /// Dress the scene for the session's phase. Call after it changes.
        void SyncPhase()
        {
            var phase = session.phase;
            if (dressed == phase) return;
            var was = dressed;
            dressed = phase;
            countdown = -1;

            foreach (var part in homeParts) part.SetActive(phase == Phase.Home);
            bool work = phase == Phase.Work;
            foreach (var chip in chips) chip.go.SetActive(work);
            mic.go.SetActive(work);
            SetHover(-1);
            foreach (var bar in voice) bar.gameObject.SetActive(false);
            cardHome = work ? workHome : reviewHome;

            bool playing = phase == Phase.Review || work;
            hud.go.SetActive(playing);
            if (playing)
            {
                marks.Clear();
                hud.t.position = new Vector3(0, hudY, cardHome.z + 0.06f);
                DrawHud();
            }

            bool counting = phase == Phase.Intro1 || phase == Phase.Intro2 || phase == Phase.Done;
            introPunch = 1;
            if (playing && (was == Phase.Intro1 || was == Phase.Intro2))
            {
                // The countdown ends on GO!, which hangs on as the first card comes in.
                CardArt.Countdown(painter, intro.rt, work ? "ROUND 2" : "ROUND 1", "GO!", Level);
                goTimer = 0.6f;
                intro.go.SetActive(true);
                if (screen) screen.Punch(0.5f);
                space.Kick(0.8f);
            }
            else intro.go.SetActive(counting);

            if (phase == Phase.Intro1) phaseTimer = tuning.introSeconds;
            else if (phase == Phase.Intro2) phaseTimer = tuning.intro2Seconds;
            else if (phase == Phase.Done)
            {
                phaseTimer = tuning.doneSeconds;
                confetti = 1.6f;
                space.Wish(7);
                sfx.Done();
                if (screen) { screen.Punch(0.8f); screen.Flash(Color.white, 0.3f); }
            }
            if (counting) DrawIntroText();
            sfx.Music(phase != Phase.Home ? Level.music : null);
            hintsForXR = InXR();
            DrawHints();
        }

        void DrawIntroText()
        {
            string count = Mathf.Max(1, countdown).ToString();
            if (dressed == Phase.Intro1) CardArt.Countdown(painter, intro.rt, "ROUND 1", count, Level);
            else if (dressed == Phase.Intro2) CardArt.Countdown(painter, intro.rt, "ROUND 2", count, Level);
            else
            {
                int sent = session.replied + session.dictated;
                CardArt.Summary(painter, intro.rt, session.Rank, new[]
                {
                    $"{session.destroyed} sliced  ·  {sent} replied  ·  {session.later} tomorrow",
                    session.mistakes > 0
                        ? $"{session.mistakes} you needed went in the bin. Oops."
                        : $"Nothing important was harmed. Best streak: {session.bestStreak}.",
                }, Level);
            }
        }

        void DrawHud()
        {
            int total = session.phase == Phase.Work ? session.keptEmails.Count : session.deck.Count;
            CardArt.Hud(painter, hud.rt, session.phase == Phase.Work ? "ROUND 2" : "ROUND 1", total, marks);
        }

        // ------------------------------------------------------------- the card

        void ShowCard()
        {
            var email = session.Current;
            if (email == null) return;
            activeFace = (activeFace + 1) % Faces;
            CardArt.EmailCard(painter, cardFaces[activeFace], email);
            cardMaterial.mainTexture = cardFaces[activeFace];
            cardTint = Categories.Tint(email.category);
            cardMaterial.SetColor("_Tint", cardTint);
            bool scrolls = CardArt.Scrolls(email);
            scroll.gameObject.SetActive(scrolls);
            if (scrolls)
            {
                CardArt.ScrollContent(painter, scrollFace, email);
                scrollTime = 0;
                scrollMaterial.SetFloat("_Offset", 0);
            }
            if (session.phase == Phase.Work)
            {
                for (int i = 0; i < chips.Count; i++) CardArt.ReplyChip(painter, chips[i].rt, email.replies[i]);
            }
            cardState = CardState.Arrive;
            cardTimer = 0;
            cardAge = 0;
            readTime = 0;
            card.gameObject.SetActive(true);
            sfx.Arrive();
        }

        bool CardLive() =>
            cardState == CardState.Idle || cardState == CardState.Held ||
            cardState == CardState.Return || cardState == CardState.Dictate;

        /// Where a waiting card sits. It starts a little way back and a little
        /// small, and drifts closer and up to full size as its time runs out.
        Vector3 WaitingAt(out float scale)
        {
            float t = Mathf.Clamp01(readTime / Mathf.Max(0.1f, tuning.readSeconds));
            scale = Mathf.Lerp(0.86f, 1, t);
            return cardHome + new Vector3(0, 0, tuning.approach * (1 - t));
        }

        /// Nobody dealt with it in time: it comes on, bigger, and past a shoulder.
        void StartPass()
        {
            cardState = CardState.Pass;
            cardTimer = 0;
            passFrom = card.position;
            passTurn = card.rotation;
            passScale = card.localScale.x;
            passSide = -passSide;
            holder = null;
            SetHover(-1);
            sfx.Pass();
        }

        /// It has gone past. Back to the end of the line with it, undecided, so
        /// it comes round again later.
        void CardPassed()
        {
            card.gameObject.SetActive(false);
            cardState = CardState.Hidden;
            left.mustOpen = right.mustOpen = true;
            session.Defer();
            float popY = cardHome.y + CardH / 2 + (cardHome == workHome ? 0.05f : 0.07f);
            ShowPop("BACK LATER", Look.Dim, Look.Hex(0x2a2148), new Vector3(cardHome.x, popY, cardHome.z - 0.03f));
            pendingCard = session.Current != null;
            pendingTimer = tuning.nextDelay;
            space.Kick(0.25f);
        }

        void ShowPop(string words, Color color, Color shadow, Vector3 at)
        {
            CardArt.PixelLabel(painter, pop.rt, words, color, shadow);
            popFrom = at;
            popTilt = UnityEngine.Random.Range(-6f, 6f);
            pop.t.position = at;
            pop.go.SetActive(true);
            popAge = 0;
        }

        /// The card is gone, one way or another: mark it, tidy up, line up the next.
        void CardLeft(string headline, bool good, Vector3 at, Color mark)
        {
            card.gameObject.SetActive(false);
            cardState = CardState.Hidden;
            holder = null;
            left.mustOpen = right.mustOpen = true;
            SetHover(-1);

            flashColor = mark;
            flash.position = at + new Vector3(0, 0, -0.01f);
            flash.gameObject.SetActive(true);
            flashAge = 0;
            // Over the card in round 1; between the card and the replies in round 2.
            float popY = cardHome.y + CardH / 2 + (cardHome == workHome ? 0.05f : 0.07f);
            ShowPop(headline, good ? Color.white : Look.Coral, good ? mark : Look.Hex(0x5a0f22),
                new Vector3(cardHome.x, popY, cardHome.z - 0.03f));
            marks.Add(new Color(mark.r, mark.g, mark.b, 1));
            DrawHud();
            hudPunch = 1;

            pendingCard = session.Current != null;
            pendingTimer = tuning.nextDelay;
            space.Kick(0.3f);
            SyncPhase();
        }

        /// Send a copy of the card flying to `target`, shrinking as it goes.
        void FlyCard(Vector3 target)
        {
            flyMaterial.mainTexture = cardFaces[activeFace];
            flyer.SetPositionAndRotation(card.position, card.rotation);
            flyer.localScale = Vector3.one;
            flyer.gameObject.SetActive(true);
            flyFrom = card.position;
            flyTarget = target;
            flyAge = 0;
        }

        string Streak(string words) =>
            session.streak >= 3 ? $"{words} X{session.streak}" : words;

        /// Round 1. `at` is where it happened, `push` the weapon's velocity,
        /// `away` the direction a kept card flies, `cut` the line of the blade
        /// across the card's face (from `push` if not given).
        void DecideReview(ReviewAction action, Vector3 at, Vector3? push, Vector3? away, Vector2? cut = null)
        {
            if (!CardLive()) return;
            var verdict = session.Review(action);
            if (verdict == null) return;

            Color mark;
            string headline;
            if (action == ReviewAction.Destroy)
            {
                var dir = cut ?? Vector2.zero;
                if (dir.sqrMagnitude < 1e-6f && push.HasValue)
                {
                    var inCard = Quaternion.Inverse(card.rotation) * push.Value;
                    dir = new Vector2(inCard.x, inCard.y);
                }
                if (dir.sqrMagnitude < 1e-6f) dir = SwingCuts[swingCount++ % SwingCuts.Length];
                dir.Normalize();
                var along = card.rotation * new Vector3(dir.x, dir.y, 0);
                var local = card.InverseTransformPoint(at);
                var strike = new Vector2(Mathf.Clamp(local.x, -CardW / 2, CardW / 2), Mathf.Clamp(local.y, -CardH / 2, CardH / 2));
                at = card.TransformPoint(strike);
                mark = verdict.correct ? cardTint : Look.Coral;

                // The email comes apart along the blade's path, and everything goes off at once.
                split.Go(card, CardW, CardH, strike, dir, push ?? along * 3.5f, cardFaces[activeFace], mark);
                CutSpray(strike, dir, along, mark);
                sparks.Burst(at, along, 0.9f, Color.white, 14, 1.8f, 4.5f);
                sparks.Embers(card.position, mark, 14, 0.18f);
                hitFx.Strike(at, along, card.rotation, mark);
                boom.Go(at, along, mark, verdict.correct ? 1 : 0.8f);
                space.Kick(verdict.correct ? 1 : 0.4f);
                hitStop = tuning.hitStop;
                fovKick = 1;
                if (verdict.correct)
                {
                    if (screen) { screen.Punch(1, dir); screen.Flash(Color.white, 0.22f); }
                    sfx.Slash(session.streak);
                    headline = Streak(SliceWords[UnityEngine.Random.Range(0, SliceWords.Length)]);
                    if (session.streak % 3 == 0) space.Wish(); // every third in a row: a shooting star
                }
                else
                {
                    space.Flash(Look.Coral);
                    if (screen) { screen.Punch(1.4f, dir); screen.Flash(Look.Coral, 0.4f); }
                    sfx.Wrong();
                    headline = "OOPS! NEEDED THAT";
                }
            }
            else
            {
                // Off to the side it was thrown, or to the left by default.
                Vector3 direction = away.HasValue && away.Value.sqrMagnitude > 1e-6f
                    ? away.Value.normalized
                    : new Vector3(-1, 0.1f, 0);
                mark = Look.Hex(0x5dffa1);
                FlyCard(card.position + direction * 0.8f);
                sparks.Burst(card.position, direction, 0.6f, mark, 20, 1, 3);
                if (screen) screen.Punch(0.4f, new Vector2(direction.x, direction.y));
                sfx.Sort(session.streak);
                headline = Streak(KeepWords[UnityEngine.Random.Range(0, KeepWords.Length)]);
            }
            CardLeft(headline, verdict.correct, at, mark);
        }

        /// Pixels sprayed all along the cut, thrown the way the blade went.
        void CutSpray(Vector2 through, Vector2 dir, Vector3 along, Color mark)
        {
            // Where the line of the cut enters and leaves the card.
            float from = -10, to = 10;
            for (int axis = 0; axis < 2; axis++)
            {
                float d = dir[axis], half = axis == 0 ? CardW / 2 : CardH / 2;
                if (Mathf.Abs(d) < 1e-4f) continue;
                float a = (-half - through[axis]) / d, b = (half - through[axis]) / d;
                from = Mathf.Max(from, Mathf.Min(a, b));
                to = Mathf.Min(to, Mathf.Max(a, b));
            }
            for (int k = 0; k <= 16; k++)
            {
                var point = through + dir * Mathf.Lerp(from, to, k / 16f);
                sparks.Burst(card.TransformPoint(point), along, 0.45f, mark, 2, 1.2f, 3.8f);
            }
        }

        /// Round 2. `target` is the reply or mic it was sent through, or -1.
        void DecideWork(WorkAction action, int target)
        {
            if (!CardLive()) return;
            bool wasDictating = cardState == CardState.Dictate;
            var verdict = session.Work(action);
            if (verdict == null) return;
            foreach (var bar in voice) bar.gameObject.SetActive(false);
            if (wasDictating) CardArt.Mic(painter, mic.rt, false);
            var to = target >= 0 ? targets[target].at : laterTarget;
            Color mark = action == WorkAction.Later ? Look.Gold : Look.Hex(0x5dffa1);
            FlyCard(to);
            sparks.Burst(target >= 0 ? to : card.position, (to - card.position).normalized, 0.7f, mark, 26, 1, 3);
            if (screen) screen.Punch(0.5f, Vector2.up);
            sfx.Sort(session.streak);
            CardLeft(Streak(action == WorkAction.Later ? "TOMORROW!" : "SENT!"), true, card.position, mark);
        }

        /// The card was held over the mic long enough: pretend to listen.
        void StartDictation()
        {
            if (session.phase != Phase.Work) return;
            if (!CardLive() || cardState == CardState.Dictate) return;
            cardState = CardState.Dictate;
            dictateTimer = 0;
            returnFrom = card.position;
            holder = null;
            left.mustOpen = right.mustOpen = true;
            SetHover(-1);
            CardArt.Mic(painter, mic.rt, true);
            foreach (var bar in voice) bar.gameObject.SetActive(true);
            sfx.Blip(1.3f);
        }

        void SetHover(int target)
        {
            if (target == hover) return;
            hover = target;
            hoverTime = 0;
            foreach (var bar in bars) bar.gameObject.SetActive(false);
            if (target >= 0) sfx.Blip(1.15f);
        }

        // ------------------------------------------------------------- hands

        /// Stand in for a tracked hand or controller: used by the checks, and
        /// handy for driving the game from a tool. `joints` (26 world points
        /// in XR Hands order) makes it a bare hand; without them it is a
        /// controller. Pass `tracked: false` to stop.
        public void FakeHand(Side side, bool tracked, Vector3 at, Quaternion turn, bool closed, Vector3[] joints = null)
        {
            var hand = side == Side.Left ? left : right;
            hand.fake = tracked;
            hand.fakeAt = at;
            hand.fakeTurn = turn;
            hand.fakeClosed = closed;
            hand.fakeJoints = joints;
        }

        static readonly List<XRHandSubsystem> handSystems = new List<XRHandSubsystem>();
        XRHandSubsystem handSystem;

        /// Fill hand.joints from the headset's hand tracking. False if the
        /// hand is not being tracked (it is holding a controller, or is out of view).
        bool ReadJoints(Hand hand, out Pose palm)
        {
            palm = default;
            if (handSystem == null || !handSystem.running)
            {
                handSystem = null;
                SubsystemManager.GetSubsystems(handSystems);
                foreach (var system in handSystems) if (system.running) handSystem = system;
                if (handSystem == null) return false;
            }
            var tracked = hand.side == Side.Left ? handSystem.leftHand : handSystem.rightHand;
            if (!tracked.isTracked) return false;
            for (var id = XRHandJointID.BeginMarker; id < XRHandJointID.EndMarker; id++)
            {
                if (!tracked.GetJoint(id).TryGetPose(out Pose pose)) return false;
                if (id == XRHandJointID.Palm) palm = pose;
                hand.joints[id.ToIndex()] = rig ? rig.TransformPoint(pose.position) : pose.position;
            }
            return true;
        }

        /// Thumb and index together, or the whole hand closed.
        bool HandClosed(Hand hand)
        {
            float pinch = Vector3.Distance(hand.joints[ThumbTip], hand.joints[IndexTip]);
            float curl = Vector3.Distance(hand.joints[MiddleTip], hand.joints[Wrist]);
            if (curl > 0 && curl < tuning.fistCurl) return true;
            return pinch < (hand.closed ? tuning.pinchOff : tuning.pinchOn);
        }

        /// Where one hand is, how fast it is moving and whether it is closed.
        void ReadHand(Hand hand, float dt)
        {
            bool found = false, closed = false, trigger = false, joints = false;
            Vector3 at = default;
            Quaternion turn = Quaternion.identity;
            if (hand.fake)
            {
                found = true;
                at = hand.fakeAt;
                turn = hand.fakeTurn;
                closed = hand.fakeClosed;
                if (hand.fakeJoints != null)
                {
                    joints = true;
                    Array.Copy(hand.fakeJoints, hand.joints, JointCount);
                    closed = HandClosed(hand) || closed;
                }
            }
            else if (SeatedRig.InHeadset)
            {
                if (ReadJoints(hand, out Pose palm))
                {
                    found = joints = true;
                    at = rig ? rig.TransformPoint(palm.position) : palm.position;
                    turn = rig ? rig.rotation * palm.rotation : palm.rotation;
                    closed = HandClosed(hand);
                }
                else
                {
                    InputDevice device = InputDevices.GetDeviceAtXRNode(hand.side == Side.Left ? XRNode.LeftHand : XRNode.RightHand);
                    if (device.isValid &&
                        device.TryGetFeatureValue(CommonUsages.devicePosition, out Vector3 local) &&
                        device.TryGetFeatureValue(CommonUsages.deviceRotation, out Quaternion localTurn))
                    {
                        found = true;
                        at = rig ? rig.TransformPoint(local) : local;
                        turn = rig ? rig.rotation * localTurn : localTurn;
                        device.TryGetFeatureValue(CommonUsages.gripButton, out bool grip);
                        device.TryGetFeatureValue(CommonUsages.triggerButton, out trigger);
                        closed = grip || trigger;
                    }
                }
            }
            hand.triggerWas = hand.trigger;
            hand.trigger = trigger;
            hand.hasJoints = found && joints;
            if (!found)
            {
                hand.tracked = false;
                hand.closed = false;
                hand.poking = false;
                return;
            }
            hand.closed = closed;
            hand.turn = turn;
            hand.prev = hand.palm;
            hand.palm = at;
            if (!hand.tracked || dt <= 0)
            {
                hand.prev = hand.palm;
                hand.velocity = Vector3.zero;
            }
            else
            {
                var v = (hand.palm - hand.prev) / dt;
                if (v.sqrMagnitude > 15 * 15) v = Vector3.zero; // tracking jump
                hand.velocity = Vector3.Lerp(hand.velocity, v, 0.5f);
            }
            hand.tracked = true;
            if (!hand.closed) hand.mustOpen = false;

            // Home screen buttons: poke one with a fingertip (or the controller),
            // or point a controller at it and pull the trigger.
            if (hand.trigger && !hand.triggerWas) Click(new Ray(hand.palm, hand.turn * Vector3.forward));
            bool poking = false;
            if (session.phase == Phase.Home)
            {
                var tip = hand.hasJoints ? hand.joints[IndexTip] : hand.palm;
                foreach (var button in buttons)
                {
                    var p = button.label.t.InverseTransformPoint(tip);
                    if (Mathf.Abs(p.x) > button.label.width / 2 || Mathf.Abs(p.y) > button.label.height / 2 ||
                        Mathf.Abs(p.z) > tuning.pokeDepth) continue;
                    poking = true;
                    if (!hand.poking) PressHome(button.action);
                    break;
                }
            }
            hand.poking = poking;
        }

        /// Is this world point inside the card's hit volume?
        bool TouchesCard(Vector3 point, float radius)
        {
            var p = card.InverseTransformPoint(point);
            float margin = tuning.hitMargin + radius;
            return Mathf.Abs(p.x) < CardW / 2 + margin &&
                   Mathf.Abs(p.y) < CardH / 2 + margin &&
                   Mathf.Abs(p.z) < tuning.hitDepth + radius;
        }

        /// The blade slides out of the hilt when the weapon appears, and its glow
        /// never sits quite still.
        void DressBlade(float dt, bool shown)
        {
            if (!shown) { bladeOut = 0; return; }
            bladeOut = Mathf.MoveTowards(bladeOut, 1, dt / 0.25f);
            float length = 1 - Mathf.Pow(1 - bladeOut, 3);
            float flicker = 1 + 0.06f * Mathf.Sin(clock * 47) + 0.04f * Mathf.Sin(clock * 31.7f) + 0.03f * Mathf.Sin(clock * 73);
            for (int i = 0; i < bladeParts.Count; i++)
            {
                float girth = bladeParts[i].name == "Blade" ? 1 : flicker;
                var scale = new Vector3(girth, girth, girth);
                scale[bladeAxis[i]] = Mathf.Max(0.001f, length);
                bladeParts[i].localScale = scale;
            }
        }

        static float Ease(float t) => t * t * (3 - 2 * t);
        static float Snap(float t) => t < 0.5f ? 4 * t * t * t : 1 - Mathf.Pow(-2 * t + 2, 3) / 2;

        /// Space on a monitor: the saber winds up and cuts across the email.
        void Swing()
        {
            if (!CardLive() || cardState == CardState.Held) return;
            var cut = SwingCuts[swingCount++ % SwingCuts.Length].normalized;
            if (InXR())
            {
                DecideReview(ReviewAction.Destroy, card.position, null, null, cut);
                return;
            }
            if (swingT >= 0) return;
            swingCut = cut;
            swingAt = card.position;
            swingFrame = card.rotation;
            swingT = 0;
            swingHit = false;
        }

        /// Where the saber is `e` (0..1) of the way through a cut along swingCut:
        /// the hand sweeps under the card while the blade leans into the cut.
        void SwingPose(float e, out Vector3 pos, out Quaternion rot)
        {
            var d = swingCut;
            var across = new Vector2(-d.y, d.x);
            if (across.y < 0) across = -across;
            Vector3 right = swingFrame * Vector3.right, up = swingFrame * Vector3.up, fwd = swingFrame * Vector3.forward;
            Vector3 way = right * d.x + up * d.y, side = right * across.x + up * across.y;
            pos = swingAt - side * 0.27f + way * Mathf.Lerp(-0.48f, 0.48f, e) - fwd * 0.27f;
            var blade = (side * 0.8f + fwd * 0.6f + way * Mathf.Lerp(-0.6f, 0.6f, e)).normalized;
            rot = Quaternion.FromToRotation(Vector3.up, blade);
        }

        void StrikeFromSwing()
        {
            var across = new Vector2(-swingCut.y, swingCut.x);
            if (across.y < 0) across = -across;
            var local = new Vector3(across.x, across.y, 0) * UnityEngine.Random.Range(-0.02f, 0.05f);
            var way = swingFrame * new Vector3(swingCut.x, swingCut.y, 0);
            DecideReview(ReviewAction.Destroy, card.TransformPoint(local), way * 4.5f, null, swingCut);
        }

        void UpdateWeapon(float dt)
        {
            if (!sword) return;
            var phase = session.phase;
            if (phase != Phase.Intro1 && phase != Phase.Review)
            {
                sword.gameObject.SetActive(false); // the weapon belongs to round 1
                weaponTracked = false;
                swingT = -1;
                DressBlade(dt, false);
                return;
            }

            if (!InXR())
            {
                // Desktop: the saber waits at the side, and cuts on Space.
                sword.gameObject.SetActive(true);
                DressBlade(dt, true);
                weaponTracked = false;
                var restPos = restHand + new Vector3(0, Mathf.Sin(clock * 1.3f) * 0.006f, 0);
                var restRot = Quaternion.FromToRotation(Vector3.up,
                    new Vector3(0.05f + Mathf.Sin(clock * 0.9f) * 0.02f, 0.8f, 0.6f).normalized);
                if (space is KyotoWorld)
                {
                    // Held as a right hand would hold it: the grip comes up out of the
                    // lower right corner toward the eye, and the blade points up, away and a
                    // little inward, stopping short of the letter. Set by where it falls in the
                    // picture, and nearer through a wider lens, so it looks the same in either
                    // Kyoto scene. Tracked hands retain their physical pose in the XR branch.
                    float reach = KatanaRest.z * 0.5774f / Mathf.Tan(head.fieldOfView * 0.5f * Mathf.Deg2Rad);
                    restPos = head.ViewportToWorldPoint(new Vector3(KatanaRest.x, KatanaRest.y, reach));
                    restPos += head.transform.up * Mathf.Sin(clock * 1.3f) * 0.004f;
                    var aim = KatanaAim.normalized + new Vector3(Mathf.Sin(clock * 0.9f) * 0.012f, 0, 0);
                    restRot = head.transform.rotation * Quaternion.FromToRotation(Vector3.up, aim.normalized) * Quaternion.Euler(0, KatanaTurn, 0);
                }
                Vector3 pos = restPos;
                Quaternion rot = restRot;
                if (swingT >= 0)
                {
                    swingT += dt / tuning.swingSeconds;
                    if (swingT < 0.3f)
                    {
                        SwingPose(0, out var startPos, out var startRot);
                        float k = Ease(swingT / 0.3f);
                        pos = Vector3.Lerp(restPos, startPos, k);
                        rot = Quaternion.Slerp(restRot, startRot, k);
                    }
                    else
                    {
                        float e = Snap(Mathf.Min(1, (swingT - 0.3f) / 0.7f));
                        SwingPose(e, out pos, out rot);
                        if (!swingHit && e >= 0.5f)
                        {
                            swingHit = true;
                            StrikeFromSwing();
                        }
                    }
                    if (swingT >= 1)
                    {
                        swingT = -1;
                        recover = 0;
                        swingEndPos = pos;
                        swingEndRot = rot;
                    }
                }
                else if (recover < 1)
                {
                    recover = Mathf.Min(1, recover + dt / 0.35f);
                    float k = Ease(recover);
                    pos = Vector3.Lerp(swingEndPos, restPos, k);
                    rot = Quaternion.Slerp(swingEndRot, restRot, k);
                }
                sword.SetPositionAndRotation(pos, rot);
                sword.localScale = Vector3.one;
                return;
            }

            if (!right.tracked)
            {
                sword.gameObject.SetActive(false);
                weaponTracked = false;
                DressBlade(dt, false);
                return;
            }
            if (right.hasJoints)
            {
                // Pose the weapon from the knuckles, so it does not depend on a grip
                // convention: the handle runs from the little finger to the thumb side.
                Vector3 wrist = right.joints[Wrist], middle = right.joints[MiddleKnuckle];
                Vector3 up = right.joints[IndexKnuckle] - right.joints[LittleKnuckle]; // across the knuckles
                Vector3 along = middle - wrist;                                        // toward the fingers
                if (up.sqrMagnitude < 1e-6f || along.sqrMagnitude < 1e-6f)
                {
                    sword.gameObject.SetActive(false);
                    weaponTracked = false;
                    return;
                }
                up.Normalize();
                along.Normalize();
                float tilt = tuning.weaponTiltDeg * Mathf.Deg2Rad;
                up = (up * Mathf.Cos(tilt) + along * Mathf.Sin(tilt)).normalized;
                along = (along - up * Vector3.Dot(along, up)).normalized;
                sword.SetPositionAndRotation(Vector3.Lerp(wrist, middle, 0.8f), Quaternion.LookRotation(along, up));
            }
            else
            {
                // A controller: a held rod points along its forward axis.
                sword.SetPositionAndRotation(right.palm, right.turn * Quaternion.Euler(90, 0, 0));
            }
            // Grip mode: the weapon rests small in the open hand and is harmless
            // until the hand closes on it.
            bool engaged = !tuning.gripToHit || right.closed;
            sword.localScale = Vector3.one * (engaged ? 1 : 0.45f);
            sword.gameObject.SetActive(true);
            DressBlade(dt, true);
            if (!engaged)
            {
                weaponTracked = false; // no swing carries over from the open hand
                return;
            }

            // Where the blade is now, and how fast it is moving.
            bool canHit = phase == Phase.Review && weaponTracked && dt > 0 && cardAge > 0.12f && CardLive();
            bool hit = false;
            for (int i = 0; i < SwordSamples; i++)
            {
                float along = SwordBladeStart + (SwordBladeEnd - SwordBladeStart) * i / (SwordSamples - 1);
                samples[i] = sword.TransformPoint(new Vector3(0, along, 0));
                if (!canHit || hit) continue;
                var velocity = (samples[i] - samplesPrev[i]) / dt;
                float speed = velocity.magnitude;
                // Faster than an arm can move is a tracking jump, not a swing.
                if (speed >= tuning.swordSpeed && speed < 15 && TouchesCard(samples[i], 0.015f))
                {
                    hit = true;
                    DecideReview(ReviewAction.Destroy, samples[i], velocity, null);
                }
            }
            for (int i = 0; i < SwordSamples; i++) samplesPrev[i] = samples[i];
            weaponTracked = true;
        }

        /// Close a hand on or near the card to pick it up.
        void TryGrab(Hand hand)
        {
            if (!hand.tracked || !hand.closed || hand.mustOpen) return;
            if (cardAge <= 0.1f) return;
            if (cardState != CardState.Idle && cardState != CardState.Return) return;
            var p = card.InverseTransformPoint(hand.palm);
            float ox = Mathf.Max(0, Mathf.Abs(p.x) - CardW / 2);
            float oy = Mathf.Max(0, Mathf.Abs(p.y) - CardH / 2);
            if (new Vector3(ox, oy, p.z).magnitude < tuning.grabReach)
            {
                grabOffset = card.position - hand.palm;
                grabFrom = card.position;
                cardState = CardState.Held;
                holder = hand;
                sfx.Blip();
            }
        }

        void SpringBack()
        {
            returnFrom = card.position;
            cardState = CardState.Return;
            cardTimer = 0;
            readTime = 0; // they had hold of it: give it its full wait again
            holder = null;
            SetHover(-1);
        }

        void UpdateHands(float dt)
        {
            ReadHand(left, dt);
            ReadHand(right, dt);
            DrawHand(left);
            DrawHand(right);
            var phase = session.phase;
            var hand = holder;

            if (hand == null || cardState != CardState.Held)
            {
                holder = null;
                if (phase == Phase.Review) TryGrab(left); // the right hand has the weapon
                else if (phase == Phase.Work)
                {
                    TryGrab(left);
                    if (holder == null) TryGrab(right);
                }
                return;
            }
            if (!hand.tracked) { SpringBack(); return; }

            card.position = hand.palm + grabOffset;
            var moved = card.position - grabFrom; // how far it has been carried
            float travel = moved.magnitude;
            var v = hand.velocity;

            if (phase == Phase.Review)
            {
                // Throw it anywhere, or carry it off and let go: kept.
                if (v.magnitude > tuning.swipeSpeed && travel > tuning.swipeTravel && Vector3.Dot(v, moved) > 0)
                    DecideReview(ReviewAction.Keep, card.position, null, v);
                else if (!hand.closed)
                {
                    if (travel > tuning.dropTravel) DecideReview(ReviewAction.Keep, card.position, null, moved);
                    else SpringBack();
                }
                return;
            }

            // Round 2: lift it to a reply or the mic, or on up past them for tomorrow.
            if (card.position.y > laterLine) { DecideWork(WorkAction.Later, -1); return; }
            if (!hand.closed) { SpringBack(); return; }
            int over = -1;
            for (int i = 0; i < targets.Length; i++)
            {
                if (Mathf.Abs(card.position.x - targets[i].at.x) < targets[i].halfW &&
                    Mathf.Abs(card.position.y - targets[i].at.y) < targets[i].halfH)
                    over = i;
            }
            SetHover(over);
            if (over < 0) return;
            hoverTime += dt;
            float need = over == Mic ? tuning.micHold : tuning.replyHold;
            var bar = bars[over];
            bar.gameObject.SetActive(true);
            bar.localScale = new Vector3(Mathf.Clamp(hoverTime / need, 0.001f, 1), 1, 1);
            if (hoverTime >= need)
            {
                if (over == Mic) StartDictation();
                else DecideWork(WorkAction.Reply, over);
            }
        }

        // ------------------------------------------------------------ update

        void UpdateDesktopLens()
        {
            if (head == null || InXR()) return;
            float field = restFov;
            if (space is KyotoWorld garden)
            {
                float framing = Mathf.Max(1, (16f/9) / Mathf.Max(0.1f, head.aspect));
                field = Mathf.Clamp(2 * Mathf.Atan(Mathf.Tan(garden.DesktopFieldOfView * Mathf.Deg2Rad / 2) * framing) * Mathf.Rad2Deg, 30, 85);
            }
            head.fieldOfView = field + 2.5f * fovKick * fovKick;
            if (space is KyotoWorld && hud != null && hud.t != null)
                hud.t.position = head.ViewportToWorldPoint(new Vector3(0.18f, 0.93f, 1.6f));
        }

        /// Advance the game by `delta` seconds. Update calls this every frame.
        public void Step(float delta)
        {
            if (!ready) return;
            UpdateDesktopLens();
            // The Kyoto lens and a resized desktop window must keep the hints
            // anchored inside the camera, rather than at the old saber FOV.
            if (head != null && hints != null && hints.t != null && !SeatedRig.InHeadset)
            {
                float halfHeight = Mathf.Tan(head.fieldOfView * Mathf.Deg2Rad * 0.5f) * 0.5f;
                hints.t.localPosition = new Vector3(0, -halfHeight * 0.9f, 0.5f);
                float scale = Mathf.Min(1, halfHeight * 2 * head.aspect / (Mathf.Tan(35 * Mathf.Deg2Rad) * 1.6f));
                hints.t.localScale = Vector3.one * scale;
            }
            float dt = Mathf.Min(delta, 0.05f);
            if (dev) { DevStep(dt); return; }
            // A hit holds the world still for a few frames. Hands and head never stop.
            hitStop = Mathf.Max(0, hitStop - dt);
            float world = hitStop > 0 ? dt * 0.08f : dt;
            clock += world;
            float beat = sfx.Beat;

            // Countdowns run into their round; the summary times out to home.
            var phase = session.phase;
            if (phase == Phase.Intro1 || phase == Phase.Intro2 || phase == Phase.Done)
            {
                phaseTimer -= dt;
                int count = Mathf.CeilToInt(phaseTimer);
                if (phase != Phase.Done && count != countdown && count > 0)
                {
                    countdown = count;
                    DrawIntroText();
                    introPunch = 1;
                }
                if (phaseTimer <= 0)
                {
                    if (phase == Phase.Intro1) session.BeginReview();
                    else if (phase == Phase.Intro2) session.BeginWork();
                    else session.GoHome();
                    pendingCard = session.Current != null;
                    pendingTimer = 0.3f; // let GO! land first
                    SyncPhase();
                }
            }
            if (goTimer > 0)
            {
                goTimer -= dt;
                if (goTimer <= 0 && (session.phase == Phase.Review || session.phase == Phase.Work)) intro.go.SetActive(false);
            }
            introPunch = Mathf.Max(0, introPunch - dt * 5);
            intro.t.localScale = Vector3.one * (1 + 0.12f * introPunch * introPunch);

            // The summary throws confetti for its first moments.
            if (confetti > 0 && session.phase == Phase.Done)
            {
                float before = confetti;
                confetti -= dt;
                if (Mathf.FloorToInt(before / 0.35f) != Mathf.FloorToInt(confetti / 0.35f))
                {
                    var colors = new[] { Level.accent, Level.second, Look.Gold, Look.Hex(0x5dffa1) };
                    for (int i = 0; i < 2; i++)
                    {
                        var at = IntroAt + new Vector3(UnityEngine.Random.Range(-0.5f, 0.5f), UnityEngine.Random.Range(0, 0.25f), -0.1f);
                        sparks.Burst(at, Vector3.up, 0.9f, colors[UnityEngine.Random.Range(0, colors.Length)], 14, 1, 3, 0.012f, 0.9f, 3);
                    }
                    space.Kick(0.5f);
                }
            }

            // Next card.
            if (pendingCard && cardState == CardState.Hidden)
            {
                pendingTimer -= world;
                if (pendingTimer <= 0)
                {
                    pendingCard = false;
                    ShowCard();
                }
            }

            // Card motion. An email comes out of the middle of the sky, waits in
            // front of the player, drifting closer, and if nothing is done with it
            // in time it flies on past them and goes back in line. While it waits
            // it is never quite still: a slow bob and a lazy sway.
            cardAge += dt;
            landed = Mathf.Min(1, landed + world / 0.35f);
            float bob = Mathf.Sin(clock * 1.7f) * 0.008f;
            var sway = Quaternion.Euler(
                4 + Mathf.Sin(clock * 1.1f) * 1.2f, // top leaning away a little
                Mathf.Sin(clock * 0.8f) * 2f,
                Mathf.Sin(clock * 1.3f + 1) * 0.8f);
            var waitAt = WaitingAt(out float waitScale);
            if (cardState == CardState.Arrive)
            {
                // From a speck dead ahead to its place: quick at first, then easing
                // in so there is time to start reading before it settles.
                cardTimer += world;
                float t = Mathf.Min(1, cardTimer / tuning.arriveSeconds);
                float ease = 1 - Mathf.Pow(1 - t, 3);
                var from = new Vector3(0, SeatedRig.SeatedEyeHeight, cardHome.z + 16);
                card.position = Vector3.Lerp(from, waitAt, ease) + new Vector3(0, bob * ease, 0);
                card.rotation = sway;
                card.localScale = Vector3.one * Mathf.Lerp(0.03f, waitScale, ease);
                if (t >= 1)
                {
                    cardState = CardState.Idle;
                    cardAge = 0;
                    landed = 0;
                }
            }
            else if (cardState == CardState.Idle)
            {
                readTime += world;
                waitAt = WaitingAt(out waitScale);
                card.position = waitAt + new Vector3(0, bob, 0);
                card.rotation = sway;
                card.localScale = Vector3.one * waitScale * (1 + 0.01f * beat);
                // Time is up, unless the saber is already on its way.
                if (readTime >= tuning.readSeconds && swingT < 0) StartPass();
            }
            else if (cardState == CardState.Pass)
            {
                // It slides up and aside first, clear of the face, then rushes by.
                cardTimer += world;
                float t = Mathf.Min(1, cardTimer / tuning.passSeconds);
                var to = new Vector3(passSide * 0.42f, SeatedRig.SeatedEyeHeight + 0.32f, -0.45f);
                float aside = 1 - (1 - t) * (1 - t), rush = t * t * t;
                card.position = new Vector3(
                    Mathf.Lerp(passFrom.x, to.x, aside), Mathf.Lerp(passFrom.y, to.y, aside), Mathf.Lerp(passFrom.z, to.z, rush));
                card.rotation = passTurn * Quaternion.Euler(0, -passSide * 28 * t, -passSide * 12 * t);
                card.localScale = Vector3.one * Mathf.Lerp(passScale, 1.5f, t);
                if (t >= 1) CardPassed();
            }
            else if (cardState == CardState.Return)
            {
                cardTimer += dt;
                float t = Mathf.Min(1, cardTimer / 0.18f);
                card.position = Vector3.Lerp(returnFrom, waitAt, 1 - (1 - t) * (1 - t));
                card.localScale = Vector3.one * waitScale;
                if (t >= 1) cardState = CardState.Idle;
            }
            else if (cardState == CardState.Dictate)
            {
                // The card waits under the mic while the voice meter dances.
                dictateTimer += dt;
                var micAt = targets[Mic].at;
                float t = Mathf.Min(1, dictateTimer / 0.2f);
                card.position = Vector3.Lerp(returnFrom, new Vector3(micAt.x, micAt.y - 0.27f, micAt.z), t);
                for (int i = 0; i < voice.Count; i++)
                {
                    float level = 0.25f + Mathf.Abs(Mathf.Sin(clock * (7 + i * 1.7f) + i * 1.3f));
                    voice[i].localScale = new Vector3(1, level, 1);
                }
                if (dictateTimer >= tuning.dictateSeconds) DecideWork(WorkAction.Dictate, Mic);
            }
            // The card's light: its type's colour, breathing, brighter on the beat
            // and for a moment as it settles. It flutters when its time is nearly up.
            float hurry = cardState == CardState.Idle ? Mathf.Clamp01((readTime - (tuning.readSeconds - 1.2f)) / 1.2f) : 0;
            float glow = 0.45f + 0.1f * Mathf.Sin(clock * 3.1f) + 0.25f * beat + 0.6f * (1 - landed)
                + 0.4f * hurry * (0.5f + 0.5f * Mathf.Sin(clock * 16));
            cardGlowMaterial.color = new Color(cardTint.r, cardTint.g, cardTint.b, glow);
            cardAuraMaterial.color = new Color(cardTint.r, cardTint.g, cardTint.b, 0.05f + 0.04f * beat + 0.12f * (1 - landed));
            // A newsletter's preview holds on its headline, then scrolls.
            if (scroll.gameObject.activeInHierarchy)
            {
                scrollTime += world;
                scrollMaterial.SetFloat("_Offset", Mathf.Max(0, scrollTime - 0.9f) * 48f / CardArt.ScrollHeight);
            }

            UpdateHands(dt);
            UpdateWeapon(dt);

            // The blade: its trail and its hum, which sweeps up as it swings.
            bool bladeLit = sword && sword.gameObject.activeSelf;
            if (bladeLit)
            {
                float length = Mathf.Lerp(SwordBladeStart, SwordBladeEnd, bladeOut);
                Vector3 inner = sword.TransformPoint(0, Mathf.Lerp(SwordBladeStart, length, 0.72f), 0);
                Vector3 tip = sword.TransformPoint(0, length, 0);
                float speed = dt > 0 ? (tip - tipWas).magnitude / dt : 0;
                if (speed > 25) speed = 0; // it was just put somewhere new
                tipSpeed = Mathf.Lerp(tipSpeed, speed, 0.4f);
                tipWas = tip;
                if ((swingT >= 0 && swingT < 0.3f) ||
                    (space is KyotoWorld && !InXR() && swingT < 0))
                    trail.Clear(); // no wind-up or idle katana trail when the view resizes
                else trail.Push(inner, tip, clock);
            }
            else
            {
                tipSpeed = 0;
                trail.Clear();
            }
            sfx.Hum(bladeLit && Level.hum, tipSpeed);
            sfx.Swing(bladeLit && !Level.hum, tipSpeed, dt);   // a blade that does not hum is heard when it is swung

            // The world around the seat.
            var mood = session.phase;
            bool playing = mood == Phase.Review || mood == Phase.Work;
            float energy = Mathf.Clamp01(session.streak / 10f);
            space.Round(mood != Phase.Home);
            space.Step(world, playing ? tuning.driftSpeed : tuning.driftSpeed * 0.3f, beat, playing ? energy : 0);
            sparks.Step(world);
            hitFx.Step(world);
            boom.Step(world);
            split.Step(world);
            sfx.Step(dt);
            if (screen) screen.Tick(dt);
            // On a monitor a hit punches the view out for a moment. Never in a headset.
            fovKick = Mathf.Max(0, fovKick - dt * 5);
            UpdateDesktopLens();
            if (hintsForXR != InXR()) { hintsForXR = InXR(); DrawHints(); }

            // A kept or sent card flying off.
            if (flyAge < 1)
            {
                flyAge = Mathf.Min(1, flyAge + world / 0.26f);
                flyer.position = Vector3.Lerp(flyFrom, flyTarget, flyAge * flyAge);
                flyer.localScale = Vector3.one * (1 - 0.85f * flyAge);
                if (flyAge >= 1) flyer.gameObject.SetActive(false);
            }

            // Flash, pop-up, HUD, and the reply the card is hovering over.
            if (flashAge < 1)
            {
                flashAge = Mathf.Min(1, flashAge + world / 0.3f);
                flash.localScale = Vector3.one * (0.15f + flashAge * 0.45f);
                flashColor.a = 0.55f * (1 - flashAge);
                flashMaterial.color = flashColor;
                if (flashAge >= 1) flash.gameObject.SetActive(false);
            }
            if (popAge < 1)
            {
                // It punches in big and tilted, settles, then drifts up and fades.
                popAge = Mathf.Min(1, popAge + dt / 0.85f);
                float punch = Mathf.Clamp01(popAge / 0.1f);
                pop.t.localScale = Vector3.one * (1.8f - 0.8f * (1 - Mathf.Pow(1 - punch, 3)));
                pop.t.rotation = Quaternion.Euler(0, 0, popTilt * (1 - Mathf.Min(1, popAge * 3)));
                pop.t.position = popFrom + new Vector3(0, popAge * 0.08f, 0);
                Look.SetOpacity(pop.material, 1 - Mathf.Pow(Mathf.Max(0, popAge - 0.3f) / 0.7f, 2));
                if (popAge >= 1) pop.go.SetActive(false);
            }
            hudPunch = Mathf.Max(0, hudPunch - dt * 6);
            hud.t.localScale = Vector3.one * (1 + 0.06f * hudPunch * hudPunch);
            for (int i = 0; i < chips.Count; i++) chips[i].t.localScale = Vector3.one * (hover == i ? 1.1f : 1);
            mic.t.localScale = Vector3.one * (hover == Mic || cardState == CardState.Dictate ? 1.15f : 1);

            // Home: the logo floats and the big button asks to be pressed.
            if (session.phase == Phase.Home)
            {
                logo.position = new Vector3(0, logoY + Mathf.Sin(clock * 1.2f) * 0.004f, homeZ);
                startButton.label.t.localScale = Vector3.one * (1 + 0.02f * Mathf.Sin(clock * 3.2f) + 0.02f * beat);
            }
        }
    }
}
