using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace InboxZero.EditorTools
{
    /// Plays one whole session without entering Play mode, checks the state
    /// after every step and saves a screenshot of each screen to Checks/.
    /// Menu: Inbox Zero > Run Playthrough Check. From a terminal:
    ///   Unity -batchmode -projectPath . -executeMethod InboxZero.EditorTools.Playthrough.Run -quit
    public static class Playthrough
    {
        static InboxGame game;
        static Camera head;
        static int failures;

        static void Expect(bool ok, string what)
        {
            if (ok) Debug.Log("[check] ok    " + what);
            else { failures++; Debug.LogError("[check] FAIL  " + what); }
        }

        static void Advance(float seconds)
        {
            for (float t = 0; t < seconds; t += 1 / 72f) game.Step(1 / 72f);
        }

        static void Shot(string name)
        {
            var rt = new RenderTexture(1280, 800, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            float previousAspect = head.aspect;
            head.targetTexture = rt;
            head.aspect = rt.width / (float)rt.height;
            game.Step(0); // settle the responsive desktop lens and hint anchor for this render target
            if (UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null)
                UnityEngine.Rendering.RenderPipeline.SubmitRenderRequest(head,
                    new UnityEngine.Rendering.Universal.UniversalRenderPipeline.SingleCameraRequest { destination = rt });
            else head.Render();
            head.targetTexture = null;
            head.aspect = previousAspect;
            var previous = RenderTexture.active;
            RenderTexture.active = rt;
            var image = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
            image.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            image.Apply();
            RenderTexture.active = previous;
            Directory.CreateDirectory("Checks");
            File.WriteAllBytes($"Checks/{name}.png", image.EncodeToPNG());
            Object.DestroyImmediate(image);
            rt.Release();
            Object.DestroyImmediate(rt);
        }

        /// A stand-in tracked hand: 26 joints in XR Hands order. `up` runs from the
        /// little finger to the index finger, `along` from the wrist to the fingers.
        static Vector3[] BareHand(Vector3 wrist, Vector3 up, Vector3 along, bool pinch)
        {
            var joints = new Vector3[26];
            joints[0] = wrist;
            joints[1] = wrist + along * 0.05f; // palm
            float[] spread = { 0.03f, 0.01f, -0.01f, -0.03f }; // index, middle, ring, little
            for (int finger = 0; finger < 4; finger++)
            {
                int first = 6 + finger * 5;
                for (int k = 0; k < 5; k++)
                    joints[first + k] = wrist + up * spread[finger] + along * (0.03f + 0.035f * k + (k > 0 ? 0.025f : 0));
            }
            var indexTip = joints[10];
            var thumbTip = pinch ? indexTip : wrist + up * 0.08f + along * 0.07f;
            for (int k = 0; k < 4; k++) joints[2 + k] = Vector3.Lerp(wrist + up * 0.02f, thumbTip, (k + 1) / 4f);
            return joints;
        }

        static void Bounds(string name)
        {
            var go = GameObject.Find(name);
            var b = new Bounds();
            bool first = true;
            foreach (var r in go.GetComponentsInChildren<MeshRenderer>(true))
            {
                if (first) { b = r.bounds; first = false; } else b.Encapsulate(r.bounds);
            }
            Debug.Log($"[check] {name} bounds min {b.min:F3} max {b.max:F3}");
        }

        static void SaveTexture(RenderTexture rt, string path)
        {
            var previous = RenderTexture.active;
            RenderTexture.active = rt;
            var image = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
            image.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            image.Apply();
            RenderTexture.active = previous;
            File.WriteAllBytes(path, image.EncodeToPNG());
            Object.DestroyImmediate(image);
        }

        /// One card of each email type, flat, to Checks/cards/.
        static void SaveCards()
        {
            Directory.CreateDirectory("Checks/cards");
            var painter = new Painter();
            var rt = Painter.NewTarget(1024, 640);
            var seen = new System.Collections.Generic.HashSet<Category>();
            foreach (var email in Emails.All)
            {
                if (!seen.Add(email.category)) continue;
                CardArt.EmailCard(painter, rt, email);
                SaveTexture(rt, $"Checks/cards/{email.category}.png");
                if (!CardArt.Scrolls(email)) continue;
                var tall = Painter.NewTarget((int)CardArt.ScrollWindow.width, CardArt.ScrollHeight);
                CardArt.ScrollContent(painter, tall, email);
                SaveTexture(tall, $"Checks/cards/{email.category}-scroll.png");
                tall.Release();
            }
            rt.Release();
        }

        /// How far the active Kyoto scene's own time has run, 0..1.
        static float Fade()
        {
            var garden = Object.FindAnyObjectByType<KomorebiGarden>();
            if (garden != null) return garden.twilight;
            var courtyard = Object.FindAnyObjectByType<KyotoCourtyard>();
            return courtyard != null ? courtyard.night : 0;
        }

        /// A Kyoto level: pick it, read a letter, cut one with the katana, look
        /// around, and wait for the light to change. Screenshots <prefix>1..12:
        /// k for the Komorebi garden (tile 1), v for the v2 courtyard (tile 2).
        static void KyotoPass(int tile, string title, string k)
        {
            EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single);
            game = Object.FindAnyObjectByType<InboxGame>();
            head = game.head;
            head.transform.localPosition = new Vector3(0, SeatedRig.SeatedEyeHeight, 0);
            game.tuning.roundSize = 6;
            game.startMuted = true;
            game.Init();
            Advance(0.1f);
            var eye = head.transform.position;
            game.Click(new Ray(eye, game.LevelTileAt(tile) - eye));
            Expect(game.Level.name == title, title + " can be picked");
            game.Click(new Ray(eye, game.LevelTileAt(0) - eye));
            Expect(UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline == null,
                "returning to Retro restores its built-in renderer");
            if (tile == 2)
            {
                // From one Kyoto scene straight to the other.
                game.Click(new Ray(eye, game.LevelTileAt(1) - eye));
                game.Click(new Ray(eye, game.LevelTileAt(2) - eye));
                Expect(Object.FindAnyObjectByType<KyotoCourtyard>() != null && Object.FindAnyObjectByType<KomorebiGarden>() == null,
                    "picking Kyoto v2 swaps the garden for the courtyard");
            }
            else game.Click(new Ray(eye, game.LevelTileAt(tile) - eye));
            Expect(GameObject.Find("Kyoto") != null && GameObject.Find("Space") == null, "picking it swaps the starfield for the courtyard");
            Advance(0.6f);
            Shot(k + "1-home");
            Expect(UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline is UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset,
                "Kyoto uses the Komorebi URP renderer");
            // Narrower than the saber level's 70: 48 for the garden and 56 for the courtyard at 16:9.
            Expect(head.fieldOfView < 66, "the Kyoto framing survives the gameplay camera update");
            game.Click(new Ray(eye, game.StartAt - eye));
            Expect(game.Phase == Phase.Intro1, "the Kyoto round starts");
            Advance(1.5f);
            Shot(k + "2-intro");
            Advance(1.6f + game.tuning.arriveSeconds + 0.6f);
            Expect(game.Phase == Phase.Review && game.Card == CardState.Idle, "a letter arrives");
            Shot(k + "3-letter");
            // Five seconds as a film strip (Checks/kyoto-clip, Checks/v2-clip): the
            // letter waits while the garden moves, then the katana cuts it.
            int before = game.Session.destroyed;
            string clip = tile == 2 ? "v2-clip" : "kyoto-clip";
            Directory.CreateDirectory("Checks/" + clip);
            for (int frame = 0; frame < 120; frame++)
            {
                if (frame == 54) game.Key("Space");
                Advance(1 / 24f);
                Shot($"{clip}/{frame:000}");
                if (frame == 56) Shot(k + "4-swing");
                if (frame == 60) Shot(k + "5-cut");
            }
            Expect(game.Session.destroyed == before + 1, "the katana cuts a letter");
            head.transform.localRotation = Quaternion.Euler(0, -50, 0);
            Shot(k + "6-look-left");
            head.transform.localRotation = Quaternion.Euler(0, 50, 0);
            Shot(k + "7-look-right");
            head.transform.localRotation = Quaternion.Euler(-28, 0, 0);
            Shot(k + "8-look-up");
            head.transform.localRotation = Quaternion.identity;
            Advance(46f);
            Shot(k + "9-later");

            // The dev view: the scene alone, to look around in.
            float fadeBeforeDev = Fade();
            game.SetDev(true);
            Expect(game.Dev && GameObject.Find("EmailCard") == null && GameObject.Find("RoundHud") == null && GameObject.Find("Katana") == null,
                "the dev view puts the email, the labels and the weapon away");
            int decided = game.Session.destroyed + game.Session.kept;
            var phaseWas = game.Phase;
            game.DevLook(-38, 6);
            Advance(3f);
            Expect(game.Phase == phaseWas && game.Session.destroyed + game.Session.kept == decided, "the session stands still in the dev view");
            Shot(k + "10-dev-left");
            game.DevLook(42, 2);
            Advance(0.2f);
            Shot(k + "11-dev-right");
            game.DevLook(0, 0);
            game.SetDev(false);
            Advance(0.1f);
            Expect(!game.Dev && head.transform.localRotation == Quaternion.identity && GameObject.Find("RoundHud") != null,
                "leaving the dev view brings the game back");
            Expect(Fade() >= fadeBeforeDev - 0.01f,
                "leaving the dev view preserves the time-of-day transition");
            SeatedRig.DeskLook = Quaternion.identity;

            // Kyoto's tighter desktop lens must also leave the round-two
            // replies, microphone and round counter visible.
            for (int i = 0; i < 12 && game.Phase == Phase.Review; i++)
            {
                game.Key("A");
                Advance(1.8f);
            }
            if (game.Phase == Phase.Intro2) { game.Key("Space"); Advance(2); }
            Expect(game.Phase == Phase.Work, "Kyoto reaches the reply round");
            Shot(k + "12-replies");
            var hud = GameObject.Find("RoundHud");
            var hudAt = head.WorldToViewportPoint(hud.transform.position);
            Expect(hudAt.y > 0.1f && hudAt.y < 0.96f, "the Kyoto round counter stays inside the desktop view");
            var replyAt = head.WorldToViewportPoint(game.ReplyAt(0));
            Expect(replyAt.y > 0.1f && replyAt.y < 0.9f, "the Kyoto reply controls stay inside the desktop view");
        }

        [MenuItem("Inbox Zero/Run Playthrough Check")]
        public static void Run()
        {
            failures = 0;
            EditorSceneManager.OpenScene("Assets/Scenes/Main.unity", OpenSceneMode.Single);
            game = Object.FindAnyObjectByType<InboxGame>();
            head = game.head;
            head.transform.localPosition = new Vector3(0, SeatedRig.SeatedEyeHeight, 0);
            game.tuning.roundSize = 6;
            game.sword.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            Bounds("Sword"); Bounds("Arena");
            game.startMuted = true;
            game.Init();
            var s = game.Session;

            // Home.
            Advance(0.1f);
            Expect(game.Phase == Phase.Home, "starts on the home screen");
            Shot("1-home");
            game.ShootingStar();
            Advance(0.62f);
            Shot("1b-shooting-star");
            Expect(game.Level.name == "KYOTO V2", "the game opens on Kyoto v2");
            var eye = head.transform.position;
            game.Click(new Ray(eye, game.LevelTileAt(Levels.All.Length - 1) - eye));
            Expect(game.Phase == Phase.Home && game.Level.name == "KYOTO V2", "a locked level cannot be picked");
            game.Click(new Ray(eye, game.LevelTileAt(0) - eye));
            Expect(game.Phase == Phase.Home && game.Level.name == "RETRO SABER", "the first level is picked");
            game.Click(head.ViewportPointToRay(new Vector3(0.9f, 0.1f, 0))); // nothing there
            Expect(game.Phase == Phase.Intro1, "a click on empty space opens the round 1 intro");

            // Round 1 intro counts down into the review.
            Advance(1.5f);
            Shot("2-intro1");
            Advance(2.35f);
            Shot("2b-email-arriving");
            Advance(1.25f);
            Expect(game.Phase == Phase.Review, "the intro counts down into round 1");
            Expect(game.Card == CardState.Idle, "the first email has arrived");
            Expect(s.Remaining == 6, "six emails to review");
            Shot("3-review");

            // Left alone, an email drifts closer for a few seconds, then flies
            // past and goes to the back of the line.
            var waiting = s.Current;
            for (int i = 0; i < 72 * 8 && game.Card == CardState.Idle; i++) game.Step(1 / 72f);
            Expect(game.Card == CardState.Pass, "an email left alone flies past");
            Advance(0.3f);
            Shot("3b-flying-past");
            Advance(2.4f);
            Expect(game.Card == CardState.Idle && s.Current != waiting, "the next email comes in");
            Expect(s.deck[s.deck.Count - 1] == waiting && s.Remaining == 6 && s.destroyed + s.kept == 0,
                "the one that flew past is back in line, undecided");

            // Keys: destroy one, keep one.
            game.Key("Space");
            Advance(0.12f);
            Shot("4-destroyed");
            Expect(s.destroyed == 1, "Space destroys the email");
            Advance(1.8f);
            game.Key("A");
            Expect(s.kept == 1, "A keeps the email");
            Advance(1.8f);

            // A stand-in right hand swings the sword through the card.
            var cardAt = game.CardPosition;
            var grip = Quaternion.Euler(-60, 0, 0); // blade up and a little forward
            for (int i = 0; i <= 12; i++)
            {
                float x = Mathf.Lerp(0.45f, -0.45f, i / 12f);
                game.FakeHand(Side.Right, true, new Vector3(x, cardAt.y - 0.2f, cardAt.z - 0.25f), grip, false);
                game.Step(1 / 72f);
                if (i == 3) Shot("5-sword-in-hand");
            }
            Expect(s.destroyed == 2, "swinging the sword through the card destroys it");
            Advance(1.8f);

            // A slow pass of the blade must not cut.
            for (int i = 0; i <= 120; i++)
            {
                float x = Mathf.Lerp(0.45f, -0.45f, i / 120f);
                game.FakeHand(Side.Right, true, new Vector3(x, cardAt.y - 0.2f, cardAt.z - 0.25f), grip, false);
                game.Step(1 / 72f);
            }
            Expect(s.destroyed == 2, "a slow pass of the blade does not cut");
            game.FakeHand(Side.Right, true, new Vector3(0.5f, 0.8f, 0.3f), grip, false);
            Advance(0.2f);

            // A stand-in left hand grabs the card and throws it left: kept.
            var reach = game.CardPosition + new Vector3(-0.05f, 0, -0.03f);
            game.FakeHand(Side.Left, true, reach, Quaternion.identity, false);
            game.Step(1 / 72f);
            game.FakeHand(Side.Left, true, reach, Quaternion.identity, true);
            game.Step(1 / 72f);
            Expect(game.Card == CardState.Held, "closing the left hand on the card grabs it");
            for (int i = 1; i <= 10 && game.Card == CardState.Held; i++)
            {
                game.FakeHand(Side.Left, true, reach + new Vector3(-0.03f * i, 0, 0), Quaternion.identity, true);
                game.Step(1 / 72f);
            }
            Expect(s.kept == 2, "throwing the held card keeps it");
            game.FakeHand(Side.Left, true, new Vector3(-0.5f, 0.8f, 0.3f), Quaternion.identity, false);
            Advance(1.8f);

            // Grab and let go without moving: it springs back.
            reach = game.CardPosition + new Vector3(0, 0, -0.03f);
            game.FakeHand(Side.Left, true, reach, Quaternion.identity, true);
            game.Step(1 / 72f);
            game.FakeHand(Side.Left, true, reach, Quaternion.identity, false);
            game.Step(1 / 72f);
            Expect(game.Card == CardState.Return && s.kept == 2, "letting go without moving springs the card back");
            game.FakeHand(Side.Left, false, default, Quaternion.identity, false);
            game.FakeHand(Side.Right, false, default, Quaternion.identity, false);
            Advance(1.8f);

            // Finish round 1 with keys, keeping the rest.
            while (game.Phase == Phase.Review) { game.Key("A"); Advance(1.8f); }
            Expect(game.Phase == Phase.Intro2, "round 1 ends in the round 2 intro");
            Expect(s.destroyed + s.kept == 6, "every email got a decision");
            int keptCount = s.kept;
            Advance(1f);
            Shot("6-intro2");
            game.Key("Space"); // skip
            Advance(1.8f);
            Expect(game.Phase == Phase.Work, "Space skips the intro into round 2");
            Expect(s.Remaining == keptCount, "round 2 deals the kept emails");
            Shot("7-work");

            // Hold the card over the left reply for three seconds.
            reach = game.CardPosition + new Vector3(0, 0, -0.03f);
            game.FakeHand(Side.Right, true, reach, Quaternion.identity, false);
            game.Step(1 / 72f);
            game.FakeHand(Side.Right, true, reach, Quaternion.identity, true);
            game.Step(1 / 72f);
            Expect(game.Card == CardState.Held, "either hand can grab in round 2");
            var over = new Vector3(game.ReplyAt(0).x, game.ReplyAt(0).y, reach.z);
            for (int i = 1; i <= 20; i++)
            {
                game.FakeHand(Side.Right, true, Vector3.Lerp(reach, over, i / 20f), Quaternion.identity, true);
                game.Step(1 / 72f);
            }
            Advance(1.5f);
            Shot("8-work-hover");
            Expect(s.replied == 0, "half a hold does not send yet");
            Advance(1.7f);
            Expect(s.replied == 1, "holding over a reply for 3 s sends it");
            game.FakeHand(Side.Right, false, default, Quaternion.identity, false);
            Advance(1.8f);

            // Keys for the rest: dictate, tomorrow, reply.
            if (game.Phase == Phase.Work)
            {
                game.Key("M");
                Advance(1f);
                Expect(game.Card == CardState.Dictate, "M starts dictation");
                Shot("9-dictate");
                Advance(2f);
                Expect(s.dictated == 1, "dictation sends after its time");
                Advance(1.8f);
            }
            if (game.Phase == Phase.Work)
            {
                game.Key("W");
                Expect(s.later == 1, "W leaves it for tomorrow");
                Advance(1.8f);
            }
            while (game.Phase == Phase.Work) { game.Key("2"); Advance(1.8f); }
            Expect(game.Phase == Phase.Done, "round 2 ends in the summary");
            Expect(s.replied + s.dictated + s.later == keptCount, "every kept email was dealt with");
            Advance(0.8f);
            Shot("10-done");
            Advance(7f);
            Expect(game.Phase == Phase.Home, "the summary times out to the home screen");

            // Bare hands. A fingertip pokes START, then the right hand swings the
            // saber, which is posed from the knuckles.
            game.tuning.roundSize = 2;
            var open = Quaternion.identity;
            game.FakeHand(Side.Left, true, new Vector3(-0.3f, 0.9f, 0.3f), open, false,
                BareHand(new Vector3(-0.3f, 0.9f, 0.3f), Vector3.up, Vector3.forward, false));
            Advance(0.1f);
            Expect(game.Phase == Phase.Home, "a hand away from the buttons presses nothing");
            Shot("11-bare-hand");
            var poke = BareHand(Vector3.zero, Vector3.right, Vector3.forward, false);
            var toStart = game.StartAt - poke[10]; // put the index tip on START
            for (int i = 0; i < poke.Length; i++) poke[i] += toStart;
            game.FakeHand(Side.Left, true, poke[1], open, false, poke);
            game.Step(1 / 72f);
            Expect(game.Phase == Phase.Intro1, "poking START with a fingertip starts the round");
            game.FakeHand(Side.Left, false, default, open, false);
            Advance(5f);
            Expect(game.Phase == Phase.Review && game.Card == CardState.Idle, "round 1 is under way");

            var pinched = BareHand(new Vector3(0.5f, 0.8f, 0.3f), Vector3.up, Vector3.forward, true);
            Expect(Vector3.Distance(pinched[5], pinched[10]) < 0.01f, "the stand-in pinch closes thumb and index");
            cardAt = game.CardPosition;
            for (int i = 0; i <= 12; i++)
            {
                var wrist = new Vector3(Mathf.Lerp(0.45f, -0.45f, i / 12f), cardAt.y - 0.3f, cardAt.z - 0.15f);
                var joints = BareHand(wrist, Vector3.up, Vector3.forward, false);
                game.FakeHand(Side.Right, true, joints[1], open, false, joints);
                game.Step(1 / 72f);
                if (i == 4) Shot("12-saber-in-bare-hand");
            }
            Expect(s.destroyed == 1, "a bare hand swinging the saber destroys the email");
            Advance(0.15f);
            Shot("13-bare-hand-hit");
            game.FakeHand(Side.Right, false, default, open, false);
            Advance(1.8f);

            // A pinch near the card grabs it; opening the hand far away keeps it.
            var near = game.CardPosition + new Vector3(-0.1f, -0.05f, -0.08f);
            game.FakeHand(Side.Left, true, near, open, false, BareHand(near, Vector3.up, Vector3.forward, false));
            game.Step(1 / 72f);
            game.FakeHand(Side.Left, true, near, open, false, BareHand(near, Vector3.up, Vector3.forward, true));
            game.Step(1 / 72f);
            Expect(game.Card == CardState.Held, "a pinch near the card grabs it");
            for (int i = 1; i <= 40 && game.Card == CardState.Held; i++)
            {
                var carried = near + new Vector3(-0.005f * i, 0, 0); // slow: a carry, not a throw
                game.FakeHand(Side.Left, true, carried, open, false, BareHand(carried, Vector3.up, Vector3.forward, i < 40));
                game.Step(1 / 72f);
            }
            Expect(s.kept == 1 && game.Phase == Phase.Intro2, "carrying it aside and letting go keeps it");
            game.FakeHand(Side.Left, false, default, open, false);

            SaveCards();
            KyotoPass(1, "KYOTO DUSK", "k");
            KyotoPass(2, "KYOTO V2", "v");
            Debug.Log(failures == 0 ? "[check] ALL PASSED" : $"[check] {failures} FAILED");
            // Leave the saved scene untouched.
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            if (Application.isBatchMode) EditorApplication.Exit(failures == 0 ? 0 : 1);
        }
    }
}
