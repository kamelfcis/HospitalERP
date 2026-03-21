export interface ConsultationTemplate {
  key: string;
  label: string;
  subjectiveSummary: string;
  objectiveSummary: string;
  planSummary: string;
}

export interface TemplateGroup {
  specialty: string;
  label: string;
  templates: ConsultationTemplate[];
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    specialty: "general",
    label: "طب عام",
    templates: [
      {
        key: "general_cold",
        label: "نزلة برد",
        subjectiveSummary: "يشكو من سعال وسيلان أنف وارتفاع في درجة الحرارة منذ عدة أيام.",
        objectiveSummary: "التهاب في الحلق، إفراز أنفي، حرارة خفيفة.",
        planSummary: "مسكنات، خافض حرارة، راحة كافية، إكثار من السوائل.",
      },
      {
        key: "general_hypertension",
        label: "ارتفاع ضغط الدم",
        subjectiveSummary: "مريض مزمن بارتفاع ضغط الدم، يشكو من صداع.",
        objectiveSummary: "ضغط الدم مرتفع عند القياس.",
        planSummary: "مراجعة الدواء الحالي، تعديل الجرعة عند الحاجة، متابعة قياس الضغط يومياً.",
      },
    ],
  },
  {
    specialty: "pediatrics",
    label: "أطفال",
    templates: [
      {
        key: "ped_fever",
        label: "حمى الأطفال",
        subjectiveSummary: "طفل يعاني من ارتفاع في الحرارة مع قلة الشهية ونشاط أقل من المعتاد.",
        objectiveSummary: "حرارة مرتفعة، حلق طبيعي، رئتان صافيتان.",
        planSummary: "خافض حرارة مناسب للوزن، سوائل كافية، المراجعة إذا استمرت الحرارة أكثر من 3 أيام.",
      },
      {
        key: "ped_diarrhea",
        label: "إسهال الأطفال",
        subjectiveSummary: "طفل يعاني من إسهال متكرر مع ألم في البطن.",
        objectiveSummary: "بطن مرن، علامات الجفاف خفيفة.",
        planSummary: "محلول معالجة الجفاف الفموي، نظام غذائي خفيف، مراقبة علامات الجفاف.",
      },
    ],
  },
  {
    specialty: "orthopedics",
    label: "عظام",
    templates: [
      {
        key: "ortho_back",
        label: "ألم أسفل الظهر",
        subjectiveSummary: "يشكو من ألم في أسفل الظهر يزداد مع الحركة والوقوف المطوّل.",
        objectiveSummary: "حساسية عند الجس، حركة محدودة.",
        planSummary: "مسكنات ومرخيات للعضلات، راحة نسبية، تمارين إطالة، تجنب الأثقال.",
      },
      {
        key: "ortho_knee",
        label: "ألم الركبة",
        subjectiveSummary: "ألم في الركبة يزداد عند الصعود والنزول.",
        objectiveSummary: "تورم خفيف، تضخم معتدل في الركبة.",
        planSummary: "مسكنات، كمادات باردة، تمارين تقوية، تجنب الجلوس على الأرض.",
      },
    ],
  },
  {
    specialty: "gynecology",
    label: "نساء وتوليد",
    templates: [
      {
        key: "gyn_routine",
        label: "زيارة متابعة روتينية",
        subjectiveSummary: "مراجعة دورية، لا شكاوى جوهرية.",
        objectiveSummary: "الفحص ضمن الحدود الطبيعية.",
        planSummary: "متابعة دورية حسب الجدول، التزام بالتوصيات الغذائية والنشاط المعتدل.",
      },
      {
        key: "gyn_dysmenorrhea",
        label: "عسر الطمث",
        subjectiveSummary: "تشكو من ألم شديد مع الدورة الشهرية يتعارض مع النشاط اليومي.",
        objectiveSummary: "ألم أسفل البطن عند الفحص.",
        planSummary: "مسكنات قبيل بداية الدورة، راحة، ورقة متابعة للدورات.",
      },
    ],
  },
  {
    specialty: "ent",
    label: "أنف وأذن وحنجرة",
    templates: [
      {
        key: "ent_sinusitis",
        label: "التهاب الجيوب الأنفية",
        subjectiveSummary: "يشكو من ألم في الوجه والجبهة، إفراز أنفي سميك، انسداد في الأنف.",
        objectiveSummary: "إفراز أنفي قيحي، ضغط على الجيوب.",
        planSummary: "مضادات حيوية إذا لزم، بخاخ كورتيزون، غسيل أنفي ملحي، مضادات الاحتقان.",
      },
      {
        key: "ent_pharyngitis",
        label: "التهاب الحلق",
        subjectiveSummary: "يشكو من ألم في الحلق مع بلع مؤلم وصعوبة في التنفس أحياناً.",
        objectiveSummary: "التهاب واحمرار في اللوزتين.",
        planSummary: "مضادات الالتهاب، غرغرة بمحلول ملحي، مسكنات، مضاد حيوي عند الحاجة.",
      },
    ],
  },
];

export function useConsultationTemplates() {
  return { groups: TEMPLATE_GROUPS };
}
