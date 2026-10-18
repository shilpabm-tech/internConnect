const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const resumeDir = path.join(__dirname, "..", "resumes");
if (!fs.existsSync(resumeDir)) {
  fs.mkdirSync(resumeDir, { recursive: true });
}

function generateResumePdf(resume) {
  return new Promise((resolve, reject) => {
    const filename = `resume_${resume._id}_${Date.now()}.pdf`;
    const filepath = path.join(resumeDir, filename);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Photo, if provided. photoUrl comes from the existing /api/upload
    // route, so it points at a file already sitting in backend/uploads/ -
    // we read it locally rather than fetching over the network.
    if (resume.photoUrl) {
      try {
        const url = new URL(resume.photoUrl);
        if (url.pathname.startsWith("/uploads/")) {
          const localPhotoPath = path.join(__dirname, "..", url.pathname);
          if (fs.existsSync(localPhotoPath)) {
            doc.image(localPhotoPath, doc.page.width - 150, 50, {
              width: 80,
              height: 80,
            });
          }
        }
      } catch (e) {
        console.log("Could not embed resume photo, continuing without it:", e.message);
      }
    }

        doc.fontSize(22).text(resume.name || "Resume", { align: "left" });
    doc.moveDown(0.3);

    const contactLine = [resume.email, resume.phone, resume.address]
      .filter(Boolean)
      .join("   |   ");
    if (contactLine) {
      doc.fontSize(10).fillColor("#555555").text(contactLine);
    }

    const socialParts = [];
    if (resume.github) socialParts.push(`GitHub: ${resume.github}`);
    if (resume.linkedin) socialParts.push(`LinkedIn: ${resume.linkedin}`);
    if (socialParts.length > 0) {
      doc.fontSize(10).fillColor("#555555").text(socialParts.join("   |   "));
    }

    doc.fillColor("#000000");
    doc.moveDown();

    if (resume.summary) {
      doc.fontSize(14).text("Summary", { underline: true });
      doc.moveDown(0.2);
      doc.fontSize(11).text(resume.summary);
      doc.moveDown();
    }

    if (resume.education && resume.education.length > 0) {
      doc.fontSize(14).text("Education", { underline: true });
      doc.moveDown(0.2);
      resume.education.forEach((edu) => {
        doc.fontSize(11).text(`${edu.degree || ""} - ${edu.institution || ""}`.trim());
        const years = [edu.startYear, edu.endYear].filter(Boolean).join(" - ");
        if (years) {
          doc.fontSize(9).fillColor("#555555").text(years);
          doc.fillColor("#000000");
        }
        if (edu.description) doc.fontSize(10).text(edu.description);
        doc.moveDown(0.5);
      });
      doc.moveDown(0.5);
    }

    if (resume.skills && resume.skills.length > 0) {
      doc.fontSize(14).text("Skills", { underline: true });
      doc.moveDown(0.2);
      doc.fontSize(11).text(resume.skills.join(", "));
      doc.moveDown();
    }

    if (resume.experience && resume.experience.length > 0) {
      doc.fontSize(14).text("Experience", { underline: true });
      doc.moveDown(0.2);
      resume.experience.forEach((exp) => {
        doc.fontSize(11).text(`${exp.role || ""} - ${exp.company || ""}`.trim());
        const dates = [exp.startDate, exp.endDate].filter(Boolean).join(" - ");
        if (dates) {
          doc.fontSize(9).fillColor("#555555").text(dates);
          doc.fillColor("#000000");
        }
        if (exp.description) doc.fontSize(10).text(exp.description);
        doc.moveDown(0.5);
      });
      doc.moveDown(0.5);
    }

    if (resume.projects && resume.projects.length > 0) {
      doc.fontSize(14).text("Projects", { underline: true });
      doc.moveDown(0.2);
      resume.projects.forEach((proj) => {
        doc.fontSize(11).text(proj.title || "");
        if (proj.description) doc.fontSize(10).text(proj.description);
        if (proj.link) {
          doc.fontSize(9).fillColor("#1a73e8").text(proj.link);
          doc.fillColor("#000000");
        }
        doc.moveDown(0.5);
      });
    }

    doc.end();

    stream.on("finish", () => resolve(filename));
    stream.on("error", (err) => reject(err));
  });
}

module.exports = { generateResumePdf };