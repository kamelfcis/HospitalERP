import { purchasingReceivingDraftMethods } from "./purchasing-receiving-draft";
import { purchasingReceivingPostMethods } from "./purchasing-receiving-post";

const methods = {
  ...purchasingReceivingDraftMethods,
  ...purchasingReceivingPostMethods,
};

export default methods;
