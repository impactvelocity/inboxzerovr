# src/mail

How an email is drawn. `emails.ts` (the made-up inbox), `cardArt.ts` (the layout for each kind of
email), `painter.ts`, `pixelFont.ts` and `color.ts` are copies of the files of the same names in
`../../../../web/src/game`, which are themselves ports of the Unity game's `Emails.cs`, `CardArt.cs`,
`Painter.cs`, `PixelFont.cs` and `Look.cs`. They are kept word for word so a change to how emails
look can be carried across; only `tuning.ts` is cut down to the one type they need.

They draw light writing on dark glass. `../letters.ts` turns that into ink on paper.
