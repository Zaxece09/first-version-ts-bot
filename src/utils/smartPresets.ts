export const smartPpresets = [
  {
    text: `Guten Tag, ich habe Ihre Anzeige OFFER gesehen. Ist der Artikel noch verfügbar? Ich hätte Interesse an einem Kauf.`,
  },
  {
    text: `Hallo, ist OFFER noch zu haben? Ich würde es gerne kaufen.`,
  },
  {
    text: `Hallo! Ich habe Ihr Inserat OFFER entdeckt. Ist es noch verfügbar? Ich bin sehr interessiert!`,
  },
  {
    text: `Hallo, ist OFFER noch verfügbar? Wäre super, wenn ich es nehmen könnte!`,
  },
  {
    text: `Hallo, ich möchte OFFER gerne kaufen. Ist es noch zu haben?`,
  },
  {
    text: `Hallo, ich bin auf OFFER gestoßen und finde es perfekt! Ist es noch zu haben? Würde mich über eine Antwort freuen.`,
  },
];


export async function getSmartPresetsList() {
  if (smartPpresets.length === 0) {
    return "<b>❌ Умных пресетов пока нет.</b>";
  }

  return (
    "<b>Ваши умные пресеты:</b>\n" +
    smartPpresets
      .map(
        (p, i) => `
<u><b>Пресет #${i + 1}</b></u> 
      
<code>${p.text}</code>`
      )
      .join("\n\n")
  );
}
