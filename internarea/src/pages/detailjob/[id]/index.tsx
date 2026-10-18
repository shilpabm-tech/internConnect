import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Book,
  Calendar,
  Cat,
  Clock,
  DollarSign,
  ExternalLink,
  MapPin,
  X,
} from "lucide-react";
import axios from "axios";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { selectuser } from "@/Feature/Userslice";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}
// const filteredJobs = [
//     {
//       _id: "101",
//       title: "Frontend Developer",
//       company: "Amazon",
//       location: "Seattle",
//       CTC: "$100K/year",
//       Experience: "2+ years",
//       category: "Engineering",
//       StartDate: "April 1, 2025",
//       aboutCompany:
//         "Amazon is a global leader in e-commerce and cloud computing, providing cutting-edge technology solutions.",
//       aboutJob:
//         "Seeking a skilled Frontend Developer proficient in React.js, JavaScript, and UI development.",
//       Whocanapply:
//         "Developers with experience in JavaScript, React.js, and modern frontend frameworks.",
//       perks:
//         "Remote work, stock options, health insurance, learning resources.",
//       AdditionalInfo: "This role is hybrid with occasional onsite meetings.",
//       numberOfopning: "3",
//     },
//     {
//       _id: "102",
//       title: "Data Analyst",
//       company: "Microsoft",
//       location: "Remote",
//       CTC: "$90K/year",
//       Experience: "1+ years",
//       category: "Data Science",
//       StartDate: "March 15, 2025",
//       aboutCompany:
//         "Microsoft is a technology company specializing in software development, cloud computing, and AI.",
//       aboutJob:
//         "Looking for a Data Analyst with expertise in SQL, Python, and data visualization tools.",
//       Whocanapply:
//         "Candidates with experience in data analytics, SQL, Python, and Tableau/Power BI.",
//       perks: "Flexible hours, remote work, upskilling programs, bonuses.",
//       AdditionalInfo: "This is a fully remote role.",
//       numberOfopning: "2",
//     },
//     {
//       _id: "103",
//       title: "UX Designer",
//       company: "Apple",
//       location: "California",
//       CTC: "$110K/year",
//       Experience: "3+ years",
//       category: "Design",
//       StartDate: "March 30, 2025",
//       aboutCompany:
//         "Apple is a leader in consumer electronics and software, focusing on design and innovation.",
//       aboutJob:
//         "Seeking a UX Designer to craft intuitive user experiences for our next-generation products.",
//       Whocanapply:
//         "Designers with experience in Figma, Adobe XD, user research, and usability testing.",
//       perks:
//         "Creative environment, free lunches, fitness perks, flexible hours.",
//       AdditionalInfo: "Office-based with occasional remote work options.",
//       numberOfopning: "1",
//     },
//     {
//       _id: "104",
//       title: "Backend Developer",
//       company: "NextGen Solutions",
//       location: "Austin, TX",
//       CTC: "$90,000 - $110,000",
//       Experience: "3-5 years",
//       category: "Engineering",
//       StartDate: "March 20, 2025",
//       aboutCompany:
//         "NextGen Solutions specializes in building scalable backend systems and APIs for high-performance applications.",
//       aboutJob:
//         "Looking for a Backend Developer skilled in Node.js, Express.js, and database management.",
//       Whocanapply:
//         "Developers with experience in server-side programming, databases (SQL, NoSQL), and RESTful APIs.",
//       perks: "Stock options, remote work, gym membership, yearly bonuses.",
//       AdditionalInfo: "Hybrid role with 2 days of in-office meetings per week.",
//       numberOfopning: "3",
//     },
//     {
//       _id: "105",
//       title: "UI/UX Designer",
//       company: "Design Pro",
//       location: "San Francisco, CA",
//       CTC: "$70,000 - $85,000",
//       Experience: "2+ years",
//       category: "Design",
//       StartDate: "March 25, 2025",
//       aboutCompany:
//         "Design Pro is an award-winning UI/UX design agency focusing on innovative user experiences.",
//       aboutJob:
//         "We need a UI/UX Designer who can create user-friendly interfaces and improve the user experience of our applications.",
//       Whocanapply:
//         "Designers with proficiency in Figma, Adobe XD, and user research methodologies.",
//       perks:
//         "Creative workspace, wellness programs, free team lunches, flexible hours.",
//       AdditionalInfo: "Office-based with flexible working hours.",
//       numberOfopning: "1",
//     },
//   ];
const index = () => {
  const { t } = useTranslation("common");
  const user=useSelector(selectuser)
  const router = useRouter();
  const { id } = router.query;
  const [jobdata, setjob] = useState<any>([]);
  useEffect(() => {
    const fetchdata = async () => {
      try {
        const res = await axios.get(`https://internconnect-782f.onrender.com/api/job/${id}`);
        setjob(res.data);
      } catch (error) {
        console.log(error);
      }
    };
    fetchdata();
  }, [id]);

  const [availability, setAvailability] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  if (!jobdata) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  const handlesubmitapplication = async () => {
    if (!coverLetter.trim()) {
      toast.error(t("detailInternship.errors.coverLetterRequired"));
      return;
    }
    if (!availability) {
      toast.error(t("detailInternship.errors.availabilityRequired"));
      return;
    }
    try {
      const applicationdata = {
        category: jobdata.category,
        company: jobdata.company,
        coverLetter: coverLetter,
        user: user,
        Application: id,
        availability,
      };
      await axios.post(
        "https://internconnect-782f.onrender.com/api/application",
        applicationdata
      );
      toast.success(t("detailInternship.toasts.submitSuccess"));
      router.push("/job");
    } catch (error) {
      console.error(error);
      toast.error(t("detailInternship.toasts.submitError"));
    }
  };
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header Section */}
        <div className="p-6 border-b">
          <div className="flex items-center space-x-2 text-blue-600 mb-4">
            <ArrowUpRight className="h-5 w-5" />
            <span className="font-medium">{t("internship.activelyHiring")}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {jobdata.title}
          </h1>
          <p className="text-lg text-gray-600 mb-4">{jobdata.company}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center space-x-2 text-gray-600">
              <MapPin className="h-5 w-5" />
              <span>{jobdata.location}</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <DollarSign className="h-5 w-5" />
              <span>{t("job.ctc")} {jobdata.CTC}</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <Book className="h-5 w-5" />
              <span>{jobdata.category}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center space-x-2">
            <Clock className="h-4 w-4 text-green-500" />
            <span className="text-green-500 text-sm">
              {t("detailInternship.postedOn")} {jobdata.createAt}
            </span>
          </div>
        </div>
        {/* Company Section */}
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("detailInternship.about", { company: jobdata.company })}
          </h2>
          <div className="flex items-center space-x-2 mb-4">
            <a
              href="#"
              className="text-blue-600 hover:text-blue-700 flex items-center space-x-1"
            >
              <span>{t("detailInternship.visitWebsite")}</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="text-gray-600">{jobdata.aboutCompany}</p>
        </div>
        {/* Internship Details Section */}
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("detailJob.aboutJob")}
          </h2>
          <p className="text-gray-600 mb-6">{jobdata.aboutJob}</p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("detailInternship.whoCanApply")}
          </h3>
          <p className="text-gray-600 mb-6">{jobdata.whoCanApply}</p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("detailInternship.perks")}</h3>
          <p className="text-gray-600 mb-6">{jobdata.perks}</p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("detailInternship.additionalInfo")}
          </h3>
          <p className="text-gray-600 mb-6">{jobdata.AdditionalInfo}</p>
        </div>
        {/* Apply Button */}
        <div className="p-6 flex justify-center">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition duration-150"
          >
            {t("detailInternship.applyNow")}
          </button>
        </div>
      </div>
      {/* Apply Modal */}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  {t("detailInternship.applyTo", { company: jobdata.company })}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Resume Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("detailInternship.yourResume")}
                </h3>
                <p className="text-gray-600">
                  {t("detailInternship.resumeNote")}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("detailInternship.coverLetter")}
                </h3>
                <p className="text-gray-600 mb-2">
                  {t("detailJob.coverLetterPrompt")}
                </p>
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-black"
                  placeholder={t("detailInternship.coverLetterPlaceholder")}
                ></textarea>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("detailInternship.yourAvailability")}
                </h3>
                <div className="space-y-3">
                  {[
                    { value: "Yes, I am available to join immediately", label: t("detailInternship.availability.immediate") },
                    { value: "No, I am currently on notice period", label: t("detailInternship.availability.noticePeriod") },
                    { value: "No, I will have to serve notice period", label: t("detailInternship.availability.willServeNotice") },
                    { value: "Other", label: t("detailInternship.availability.other") },
                  ].map(({ value: option, label }) => (
                    <label key={option} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name=""
                        id=""
                        value={option}
                        checked={availability === option}
                        onChange={(e) => setAvailability(e.target.value)}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end pt-4">
                {user ? (
                  <button
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                    onClick={handlesubmitapplication}
                  >
                    {t("detailInternship.submitApplication")}
                  </button>
                ) : (
                  <Link
                    href={`/`}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  >
                    {t("detailInternship.signUpToApply")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default index;
