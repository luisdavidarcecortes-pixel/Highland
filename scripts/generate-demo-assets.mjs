/**
 * Generates demo mode assets:
 *  - public/demo/pdfs/issue-N.pdf  (8 laid-out pages via pdf-lib)
 *  - public/demo/covers/issue-N.svg (cover)
 * Usage: npm run gen:demo
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const OUT = join('public', 'demo');
mkdirSync(join(OUT, 'pdfs'), { recursive: true });
mkdirSync(join(OUT, 'covers'), { recursive: true });

const EDITIONS = [
  {
    n: 3,
    title: 'Welcome to the new school year',
    date: 'September 15, 2026',
    sections: [
      ['Interview with the new head of school', 'Ms. Carmen welcomes us to her office to talk about her plans for this year: more sports activities, a new science lab, and the return of the spring festival.'],
      ['The robotics club unveils its workshop', 'Twenty-five students from 4th to 6th grade have started building a robotic arm from recycled materials. The end-of-term exhibition will be open to families.'],
      ['Welcome week', 'A giant scavenger hunt, a community snack and door-decorating by class. The winning motto, from 5th B: "Together we make things happen".'],
    ],
  },
  {
    n: 2,
    title: 'End-of-year special',
    date: 'June 20, 2026',
    sections: [
      ['Theatre festival', 'The 5th and 6th grade classes performed "A very short Don Quixote" in front of more than two hundred people. Bravo, school theatre company!'],
      ['Farewell to 6th grade', 'Our 6th graders left us their best advice: "Make the most of the playground - we will even miss the bells".'],
      ['The year in review', 'Farm trip, swimming, cultural week, sports olympics... we look back at the best moments of the year in pictures.'],
    ],
  },
  {
    n: 1,
    title: 'The newspaper is born!',
    date: 'April 10, 2026',
    sections: [
      ['Who are we?', 'We are the newspaper team: sixteen students from 5th and 6th grade, two teachers, and plenty of enthusiasm for reporting what happens at school.'],
      ['Our sections', 'Current affairs, sports, interviews, puzzles and the humour section. Can you think of any others? Write to us.'],
      ['How to take part', 'Find us at Tuesday break in the music room, or leave your proposal in the library mailbox.'],
    ],
  },
];

const ink = rgb(0.2, 0.2, 0.2); // #333333 neutral dark gray
const brand = rgb(0, 0.44, 0.24); // Highland Academy green #00703c

function makeCoverSvg(ed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#ffffff"/>
  <rect x="0" y="0" width="600" height="12" fill="#00703c"/>
  <rect x="40" y="60" width="520" height="90" fill="none" stroke="#333333" stroke-width="4"/>
  <text x="300" y="122" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="bold" fill="#333333" text-anchor="middle">HIGHLAND ACADEMY</text>
  <text x="300" y="200" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#00703c" text-anchor="middle" letter-spacing="4">SCHOOL NEWSPAPER</text>
  <rect x="40" y="230" width="520" height="3" fill="#333333"/>
  <rect x="40" y="238" width="520" height="1.5" fill="#333333"/>
  <text x="300" y="300" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" fill="#333333" text-anchor="middle">${ed.title.length > 30 ? ed.title.slice(0, 30) + '…' : ed.title}</text>
  <text x="300" y="345" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#555" text-anchor="middle">No. ${ed.n} · ${ed.date}</text>
  <rect x="60" y="400" width="230" height="160" fill="#f5f5f5"/>
  <rect x="310" y="400" width="230" height="160" fill="#f5f5f5"/>
  <rect x="60" y="580" width="480" height="8" fill="#00703c"/>
  <text x="300" y="640" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333" text-anchor="middle">${ed.sections.map((s) => s[0]).join(' · ').slice(0, 60)}</text>
  <text x="300" y="740" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#888" text-anchor="middle">digital edition · ${ed.date}</text>
</svg>`;
}

async function makePdf(ed) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let p = 0; p < 8; p++) {
    const page = doc.addPage([595, 842]); // A4
    page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: brand });

    if (p === 0) {
      page.drawText('HIGHLAND ACADEMY', { x: 60, y: 760, size: 40, font: bold, color: ink });
      page.drawText('Student Newspaper', { x: 60, y: 735, size: 14, font, color: brand });
      page.drawRectangle({ x: 60, y: 715, width: 475, height: 3, color: ink });
      page.drawText(`No. ${ed.n} - ${ed.title}`, { x: 60, y: 680, size: 24, font: bold, color: ink });
      page.drawText(ed.date, { x: 60, y: 655, size: 12, font, color: brand });
      let y = 600;
      for (const [head, body] of ed.sections) {
        page.drawText(head, { x: 60, y, size: 16, font: bold, color: ink });
        y -= 22;
        const words = body.split(' ');
        let line = '';
        for (const w of words) {
          if ((line + w).length > 80) {
            page.drawText(line, { x: 60, y, size: 11, font, color: ink });
            y -= 15;
            line = '';
          }
          line += w + ' ';
        }
        if (line) {
          page.drawText(line, { x: 60, y, size: 11, font, color: ink });
          y -= 15;
        }
        y -= 18;
      }
      page.drawText('Page 1 of 8', { x: 60, y: 40, size: 9, font, color: brand });
    } else {
      page.drawText(`Highland Academy · No. ${ed.n}`, { x: 60, y: 790, size: 10, font: bold, color: brand });
      page.drawRectangle({ x: 60, y: 780, width: 475, height: 1, color: ink });
      const sec = ed.sections[(p - 1) % ed.sections.length];
      page.drawText(sec[0], { x: 60, y: 740, size: 20, font: bold, color: ink });
      let y = 700;
      const words = `${sec[1]} Read more in the next issue. ${sec[1]}`.split(' ');
      let line = '';
      for (const w of words) {
        if ((line + w).length > 80) {
          page.drawText(line, { x: 60, y, size: 11, font, color: ink });
          y -= 15;
          line = '';
        }
        line += w + ' ';
      }
      if (line) page.drawText(line, { x: 60, y, size: 11, font, color: ink });
      page.drawText(`Page ${p + 1} of 8`, { x: 60, y: 40, size: 9, font, color: brand });
    }
  }

  const bytes = await doc.save();
  writeFileSync(join(OUT, 'pdfs', `issue-${ed.n}.pdf`), bytes);
}

for (const ed of EDITIONS) {
  writeFileSync(join(OUT, 'covers', `issue-${ed.n}.svg`), makeCoverSvg(ed));
  await makePdf(ed);
}

console.log('Demo assets generated in public/demo');
