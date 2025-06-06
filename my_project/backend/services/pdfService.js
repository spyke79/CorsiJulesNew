const Pdfmake = require('pdfmake');
const path = require('path');
const courseModel = require('../models/courseModel'); // To get course details
const calendarLessonModel = require('../models/calendarLessonModel'); // To get lessons

// Define fonts (pdfmake requires this)
// Using standard Tinos font which is similar to Times New Roman and supports basic Unicode.
// For full Unicode support or specific styles, you might need to provide font files.
const fonts = {
  Roboto: { // pdfmake's default font
    normal: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build', 'vfs_fonts.js').includes('Roboto-Regular.ttf') ? 'Roboto-Regular.ttf' : 'Helvetica', // Fallback
    bold: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build', 'vfs_fonts.js').includes('Roboto-Medium.ttf') ? 'Roboto-Medium.ttf' : 'Helvetica-Bold',
    italics: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build', 'vfs_fonts.js').includes('Roboto-Italic.ttf') ? 'Roboto-Italic.ttf' : 'Helvetica-Oblique',
    bolditalics: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build', 'vfs_fonts.js').includes('Roboto-MediumItalic.ttf') ? 'Roboto-MediumItalic.ttf' : 'Helvetica-BoldOblique'
  },
  // For better Unicode support, you would typically provide actual font files:
  // Tinos: {
  //   normal: path.join(__dirname, '..', 'assets', 'fonts', 'Tinos-Regular.ttf'),
  //   bold: path.join(__dirname, '..', 'assets', 'fonts', 'Tinos-Bold.ttf'),
  //   italics: path.join(__dirname, '..', 'assets', 'fonts', 'Tinos-Italic.ttf'),
  //   bolditalics: path.join(__dirname, '..', 'assets', 'fonts', 'Tinos-BoldItalic.ttf')
  // }
};

// If not using custom fonts, pdfmake will use its defaults (Roboto).
// The vfs_fonts.js file is typically included with pdfmake. For server-side, you often
// point to actual font files or ensure defaults work.
// For simplicity here, I'm trying to reference Roboto from pdfmake's own vfs if possible,
// otherwise falling back to Helvetica which is a standard PDF font.
// A more robust server-side setup would involve explicitly providing font files.
// Let's assume default Roboto will work for now or use Helvetica as a fallback.
const pdfmakePrinter = new Pdfmake(fonts);


/**
 * Generates a PDF document for a course calendar.
 * @param {number} courseId The ID of the course.
 * @returns {Promise<Buffer>} A promise that resolves with the PDF document buffer.
 */
async function generateCourseCalendarPdf(courseId) {
  try {
    const course = await courseModel.getCourseById(courseId);
    if (!course) {
      throw new Error('Course not found.');
    }

    // getLessonsByCourseId already includes expert names and plesso_name (for location)
    const lessons = await calendarLessonModel.getLessonsByCourseId(courseId);

    const documentDefinition = {
      content: [
        { text: `Calendario Corso: ${course.course_name}`, style: 'header' },
        { text: `Progetto: ${course.project_name}`, style: 'subheader' },
        { text: `Scuola: ${course.school_name}`, style: 'subheader', margin: [0, 0, 0, 20] }, // Add bottom margin
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10] // [left, top, right, bottom]
        },
        subheader: {
          fontSize: 14,
          bold: false,
          margin: [0, 0, 0, 5]
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: 'black',
          fillColor: '#eeeeee',
          alignment: 'center'
        },
        tableCell: {
          fontSize: 9,
          margin: [0, 2, 0, 2]
        }
      },
      defaultStyle: {
        // font: 'Tinos' // Use this if Tinos or other custom font is configured with TTF files
         font: 'Roboto' // Default pdfmake font
      }
    };

    if (lessons.length > 0) {
      const tableBody = [
        [
          { text: 'Data', style: 'tableHeader' },
          { text: 'Orario (Inizio-Fine)', style: 'tableHeader' },
          { text: 'Lezione', style: 'tableHeader' },
          { text: 'Esperti Assegnati', style: 'tableHeader' },
          { text: 'Luogo', style: 'tableHeader' }
        ]
      ];

      lessons.forEach(lesson => {
        const lessonDate = lesson.start_time ? new Date(lesson.start_time).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : 'N/D';
        const startTime = lesson.start_time ? new Date(lesson.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : 'N/D';
        const endTime = lesson.end_time ? new Date(lesson.end_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : 'N/D';

        let location = lesson.plesso_name || course.school_name; // Default to school name if no plesso
        if (lesson.location_details) {
            location += ` (${lesson.location_details})`;
        }


        tableBody.push([
          { text: lessonDate, style: 'tableCell' },
          { text: `${startTime} - ${endTime}`, style: 'tableCell' },
          { text: lesson.lesson_title || '', style: 'tableCell' },
          { text: lesson.expert_names || 'N/A', style: 'tableCell' },
          { text: location, style: 'tableCell' }
        ]);
      });

      documentDefinition.content.push({
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', 'auto'], // Adjust widths as needed
          body: tableBody
        },
        layout: {
            fillColor: function (rowIndex, node, columnIndex) {
                return (rowIndex % 2 === 0) ? '#f5f5f5' : null; // Alternate row coloring
            },
            hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 1; },
            vLineWidth: function (i, node) { return (i === 0 || i === node.table.widths.length) ? 1 : 1; },
            hLineColor: function (i, node) { return (i === 0 || i === node.table.body.length) ? 'black' : '#dddddd'; },
            vLineColor: function (i, node) { return (i === 0 || i === node.table.widths.length) ? 'black' : '#dddddd'; },
        }
      });
    } else {
      documentDefinition.content.push({ text: 'Nessuna lezione programmata per questo corso.', style: 'subheader' });
    }

    const pdfDoc = pdfmakePrinter.createPdfKitDocument(documentDefinition);

    return new Promise((resolve, reject) => {
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', err => reject(err));
      pdfDoc.end();
    });

  } catch (error) {
    console.error('Error generating course calendar PDF:', error);
    throw error; // Rethrow to be handled by controller
  }
}

module.exports = {
  generateCourseCalendarPdf,
};
