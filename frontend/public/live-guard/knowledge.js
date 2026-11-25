// OFFLINE KNOWLEDGE BANK - checks WHAT the candidate said, not only how it sounds (no server, no key).
// Each topic = the question pattern, the ideas a correct answer must contain (weighted), typical WRONG claims, and a short reference answer.
// It covers the common fresher / data / Python / SQL / web / CS-fundamentals questions. For any other question the verdict is "Not checked"
// (never a guess). An AI key on the start page checks EVERY question; this bank is the free fallback.
// Add your own topics at the bottom (copy one block): { id, name, q, a, concepts:[[label, regex, weight]], wrong:[[regex, message]], ref }.
(function (root) {
  "use strict";
  const T = [];
  const add = (id, name, q, a, concepts, wrong, ref) => T.push({ id, name, q: new RegExp(q, "i"), a: a ? new RegExp(a, "i") : null, concepts: concepts.map(([l, r, w]) => [l, new RegExp(r, "i"), w || 1]), wrong: (wrong || []).map(([r, m, soft]) => [new RegExp(r, "i"), m, !!soft]), ref });

  // ------------------------------------------------------------------ Python
  add("list_vs_dict", "list vs dictionary", "(list|lists).*(dict|dictionary|dictionaries)|(dict|dictionary|dictionaries).*(list|lists)", "",
    [["a list is an ordered collection read by index (position)", "list.{0,60}(order|index|position|sequence)|index|position", 2], ["a dictionary stores key-value pairs", "key.{0,12}value|value.{0,12}key|key ?value", 2.5], ["list uses [ ], dictionary uses { }", "square bracket|\\[ ?\\]|curly|braces|\\{ ?\\}", 1], ["dictionary values are found by key (fast lookup); keys are unique", "unique|lookup|look up|by (the )?key|hash", 1.5]],
    [["dictionar\\w*.{0,30}(access|accessed|read|found).{0,15}by (the )?(index|position)", "Dictionary values are read by key, not by index.", true]],
    "A list is an ordered collection of items accessed by index, written with [ ]. A dictionary stores unique key-value pairs written with { } and values are looked up by key (fast). Both are mutable.");
  add("list_vs_tuple", "list vs tuple", "(list|lists).*(tuple|tuples)|(tuple|tuples).*(list|lists)", "",
    [["lists are mutable (can be changed)", "list\\w*\\W+(is|are)?\\W*mutable|mutable.{0,25}list|list.{0,40}(change|modif|edit|add|append|remove)", 2], ["tuples are immutable (cannot be changed)", "tupl\\w*\\W+(is|are)?\\W*immutable|immutable.{0,25}tupl|tupl\\w*.{0,40}(cannot|can't|not be) (change|modif)", 2], ["lists use [ ], tuples use ( )", "square bracket|\\[ ?\\]|round bracket|parenthes|\\( ?\\)", 1], ["tuples are faster / use less memory / can be dictionary keys", "faster|less memory|hashable|dictionary key|safe", 1]],
    [["tupl\\w*\\W+(is|are)\\W+(?!not\\b|never\\b)(a |an |the )?(\\w+\\W+)?mutable", "Tuples are immutable, not mutable."], ["list\\w*\\W+(is|are)\\W+(?!not\\b|never\\b)(a |an |the )?(\\w+\\W+)?immutable", "Lists are mutable, not immutable."]],
    "A list is mutable (items can be added, removed or changed) and written with [ ]; a tuple is immutable (cannot change after creation), written with ( ), a bit faster and can be used as a dictionary key.");
  add("list", "list", "\\b(what is|what are|explain|define|tell me about|about)\\b.{0,25}\\blists?\\b|^lists?\\b", "\\blist\\b.{0,50}(mutable|collection|ordered|append|index)",
    [["an ordered collection of items", "ordered|sequence|collection of (items|elements|values|objects|data)|group of (items|elements|values)|store(s)? (multiple|many)", 2], ["mutable: items can be changed / added / removed", "mutable|can (be )?(change|modif|updat|add|remov|edit)|append|insert|remove|pop", 2], ["written with square brackets [ ]", "square bracket|\\[ ?\\]|\\[", 1], ["items are accessed by index", "index|indexing|slic", 1], ["can hold different data types / duplicates", "different (data )?types|any (data )?type|mixed|heterogeneous|duplicate", 1]],
    [["list\\w*\\W+(is|are)\\W+(?!not\\b|never\\b)(a |an |the )?(\\w+\\W+)?immutable", "Lists are mutable, not immutable."], ["list\\w*.{0,20}(only|just)\\W+(of\\W+)?(strings|numbers|integers)", "A list can hold items of any type, not only one type."], ["(list\\w*|collection)\\W+of\\W+strings\\b(?!\\W+(and|or|numbers|integers))", "A list can hold items of ANY type, not only strings.", true]],
    "A list is an ordered, mutable collection written with square brackets [ ]. It can hold items of any type (even mixed), allows duplicates, and items are read by index; you can append, insert, remove or change items.");
  add("tuple", "tuple", "\\btuples?\\b", "\\btupl",
    [["an ordered collection", "ordered|sequence|collection", 1], ["immutable: cannot be changed after creation", "immutable|cannot (be )?(change|modif)|can't (be )?(change|modif)|not (be )?(change|modif)", 3], ["written with round brackets ( )", "round bracket|parenthes|\\( ?\\)", 1], ["allows duplicates / different types", "duplicate|different|mixed|any type", 1], ["hashable / dictionary key / faster", "hashable|dictionary key|faster|memory", 1]],
    [["tupl\\w*\\W+(is|are)\\W+(?!not\\b|never\\b)(a |an |the )?(\\w+\\W+)?mutable", "Tuples are immutable, not mutable."]],
    "A tuple is an ordered, immutable collection written with ( ). Once created it cannot be changed; it allows duplicates and mixed types, is slightly faster than a list and can be a dictionary key.");
  add("dictionary", "dictionary", "\\b(dictionary|dictionaries|dict)\\b", "\\bdictionar|key.{0,10}value",
    [["stores data as key-value pairs", "key.{0,12}value|key value", 3], ["keys are unique", "unique|no duplicate|cannot (have )?duplicate", 1.5], ["values are accessed by key (fast lookup)", "access.{0,20}key|by key|lookup|hash", 1], ["written with curly braces { }", "curly|\\{ ?\\}|brace", 1], ["mutable", "mutable|can (be )?(change|modif|updat)", 1]],
    [["keys?.{0,25}(can|may|are allowed to)\\W+(be\\W+)?(duplicate|repeat)", "Dictionary keys must be unique."], ["key.{0,30}(can be|may be|as) (a )?list", "A list cannot be a dictionary key (it is not hashable)."]],
    "A dictionary stores data as unique key-value pairs inside { }, so a value is found quickly by its key. It is mutable; keys must be unique and hashable (immutable types).");
  add("set", "set", "\\b(what is|explain|define|about)\\b.{0,20}\\bsets?\\b|^sets?\\b", "\\bset\\b.{0,50}(unique|duplicate|union|unordered)",
    [["unordered collection", "unordered|no order|not ordered", 1.5], ["stores only unique items (no duplicates)", "unique|no duplicate|duplicates are (removed|not allowed)|remove duplicate", 3], ["set operations: union / intersection / difference", "union|intersection|difference", 1], ["written with { } or set()", "curly|\\{ ?\\}|set\\(\\)", 1], ["items cannot be accessed by index", "index", 0.5]],
    [["sets?\\W+(allow|allows|can have|contain)s?\\W+duplicate", "A set does not allow duplicates."]],
    "A set is an unordered collection of unique items (duplicates are removed). It supports union, intersection and difference, and items cannot be read by index.");
  add("variable", "variable", "\\b(what is|what are|explain|define|about)\\b.{0,20}\\bvariables?\\b|^variables?\\b", "\\bvariable",
    [["a named location / container that stores a value", "name|container|store|hold|memory|reference|label|location", 3], ["the value can change (vary) during the program", "chang|vary|differ|different values|modif|reassign|any value", 2], ["has a name and holds a value of some type (int, string...)", "type|integer|string|number|value", 1], ["assigned with =", "assign|=|equal", 1]],
    [["variable\\w*.{0,15}\\bis\\b.{0,10}(a )?(function|loop|class)\\b", "A variable is not a function, loop or class: it stores a value."]],
    "A variable is a named place in memory that stores a value. The value can change while the program runs; in Python you create it by assigning, e.g. age = 25, and no type declaration is needed.");
  add("python", "Python", "\\bpython\\b", "\\bpython\\b",
    [["high-level, general-purpose language", "high.?level|general.?purpose|programming language", 2], ["interpreted / dynamically typed", "interpret|dynamic", 1.5], ["easy to read / simple syntax", "easy|simple|readab|syntax", 1], ["used for data science / web / automation / AI", "data science|web|automation|machine learning|\\bai\\b|scripting|analysis|development", 1.5], ["object-oriented / large libraries", "object.?oriented|librar|framework|open.?source|oop", 1]],
    [["python\\W+(is|was)\\W+(a )?(low.?level|database|operating system|browser)", "Python is a high-level programming language."], ["python\\W+(is|was)\\W+(a )?(compiled language only|assembly)", "Python is mainly an interpreted language."]],
    "Python is a high-level, interpreted, dynamically typed, general-purpose programming language with simple readable syntax, widely used for data science, automation, web development and AI.");
  add("function", "function", "\\b(what is|what are|explain|define|about)\\b.{0,20}\\bfunctions?\\b|^functions?\\b|\\bdef\\b", "\\bfunction\\b.{0,50}(call|return|parameter|reuse|def)",
    [["a reusable block of code that performs a task", "reus|block of code|set of (statements|instructions)|task|perform", 3], ["defined with def and called by name", "\\bdef\\b|call", 1.5], ["takes parameters / arguments", "parameter|argument|input", 1.5], ["can return a value", "return", 1.5]],
    [], "A function is a reusable block of code that performs a specific task. In Python it is defined with def, can take parameters and can return a value, and is run by calling its name.");
  add("lambda", "lambda function", "\\blambda\\b", "\\blambda\\b",
    [["small anonymous (nameless) function", "anonymous|no name|nameless|small", 3], ["written in one line with the lambda keyword", "one line|single line|single expression|lambda keyword|lambda x", 1.5], ["used with map / filter / sorted", "map|filter|sort|reduce", 1.5]], [],
    "A lambda is a small anonymous function written in one line, lambda x: x * 2. It has a single expression and is often used with map, filter or sorted.");
  add("decorator", "decorator", "\\bdecorators?\\b", "\\bdecorator",
    [["a function that takes a function and extends its behaviour", "takes a function|wraps?|wrapper|modif.{0,15}function|extend|add(s)? (new )?(functionality|behaviou?r)", 3], ["applied with the @ symbol", "@|at the rate|at symbol", 2], ["without changing the original code", "without (changing|modifying)", 1]], [],
    "A decorator is a function that wraps another function to add behaviour without changing its code. It is applied with @name above the function definition.");
  add("generator", "generator", "\\bgenerators?\\b|\\byield\\b", "\\byield\\b|\\bgenerator",
    [["produces values one at a time (lazy)", "one at a time|lazy|on the fly|one by one|iterat", 2.5], ["uses yield", "yield", 2.5], ["saves memory", "memory", 1.5]], [],
    "A generator is a function that uses yield to produce values one at a time, lazily, so large sequences use very little memory.");
  add("oop", "OOP", "\\b(oop|oops|object.?oriented)\\b", "object.?oriented|\\boops?\\b",
    [["programming based on classes and objects", "class|object", 2.5], ["encapsulation", "encapsulat", 1.5], ["inheritance", "inherit", 1.5], ["polymorphism", "polymorph", 1.5], ["abstraction", "abstract", 1.5]], [],
    "OOP organises code into classes and objects. Its four pillars are encapsulation, inheritance, polymorphism and abstraction.");
  add("class_object", "class and object", "\\b(class|classes)\\b.{0,25}\\b(object|objects)\\b|\\bwhat is (a )?(class|object)\\b", "",
    [["a class is a blueprint / template", "blueprint|template|design|prototype", 3], ["an object is an instance of a class", "instance|object (is|of)|created from", 3], ["has attributes (data) and methods (functions)", "attribute|propert|method|variable|function", 1.5]], [],
    "A class is a blueprint that defines attributes and methods; an object is an instance created from that class.");
  add("inheritance", "inheritance", "\\binherit", "\\binherit",
    [["a child class gets the properties and methods of a parent class", "child|derived|sub.?class|parent|base|super", 3], ["promotes code reuse", "reus|duplicat|extend", 2]], [],
    "Inheritance lets a child (derived) class acquire the attributes and methods of a parent (base) class, so code is reused and can be extended.");
  add("polymorphism", "polymorphism", "\\bpolymorph", "\\bpolymorph",
    [["one name / interface, many forms", "many forms|multiple forms|same (name|method|interface)|different (forms|behaviou?r)", 3], ["method overriding / overloading", "overrid|overload", 2]], [],
    "Polymorphism means one interface or method name can behave differently for different objects, for example through method overriding.");
  add("encapsulation", "encapsulation", "\\bencapsulat", "\\bencapsulat",
    [["wrapping data and methods together in a class", "wrap|bind|bundl|together|single unit", 3], ["hides data / access control (private)", "hid|private|restrict|protect|access", 2]], [],
    "Encapsulation bundles data and the methods that use it into one class and restricts direct access to the data (private members).");
  add("exception", "exception handling", "\\b(exception|exceptions|error handling|try.?except)\\b", "\\btry\\b.{0,20}except|exception",
    [["handling runtime errors so the program does not crash", "error|crash|runtime|handle", 2.5], ["try and except blocks", "try|except|catch", 2.5], ["finally / raise", "finally|raise|throw", 1]], [],
    "Exception handling deals with runtime errors: code that may fail is placed in a try block, errors are caught in except, and finally always runs.");
  add("mutable", "mutable and immutable", "\\b(mutable|immutable)\\b", "",
    [["mutable objects can be changed after creation", "mutable.{0,40}(can|may)|can be (changed|modified)", 2.5], ["immutable objects cannot be changed", "immutable.{0,40}(cannot|can't|not)|cannot be (changed|modified)", 2.5], ["examples: list, dict, set mutable; int, str, tuple immutable", "list|dict|set|tuple|string|int", 1.5]],
    [["string\\w*\\W+(is|are)\\W+mutable", "Strings are immutable."]],
    "Mutable objects (list, dict, set) can be changed after creation; immutable objects (int, float, str, tuple) cannot.");
  add("list_comprehension", "list comprehension", "comprehension", "comprehension",
    [["a short way to create a list in one line", "short|concise|one line|single line|compact", 2.5], ["syntax with for (and optional if) inside brackets", "for |\\bif\\b|\\[", 2]], [],
    "A list comprehension builds a list in one line, for example [x*x for x in range(5) if x % 2 == 0].");
  add("is_vs_equals", "is vs ==", "\\bis\\b.{0,12}(vs|versus|and|or).{0,12}==|== (vs|and) is|difference between (is|==)", "",
    [["== compares values", "==.{0,30}value|value.{0,20}==", 3], ["is compares identity (same object in memory)", "\\bis\\b.{0,30}(identity|same object|memory|reference)", 3]], [],
    "== checks whether two values are equal; is checks whether both names point to the very same object in memory.");
  add("shallow_deep", "shallow vs deep copy", "(shallow|deep).{0,20}copy", "(shallow|deep).{0,12}copy",
    [["shallow copy copies references of nested objects", "shallow.{0,60}(refer|same|nested|share)", 3], ["deep copy copies everything recursively (independent)", "deep.{0,60}(independent|recursive|everything|separate|new)", 3]], [],
    "A shallow copy copies only the outer object and shares nested objects; a deep copy duplicates everything recursively so the copy is fully independent.");
  add("args_kwargs", "*args and **kwargs", "\\*args|kwargs|args and kwargs", "args|kwargs",
    [["*args takes any number of positional arguments", "positional|any number of arg|variable number", 2.5], ["**kwargs takes keyword (named) arguments as a dictionary", "keyword|named|dictionary|dict", 2.5]], [],
    "*args collects any number of positional arguments into a tuple; **kwargs collects keyword arguments into a dictionary.");
  add("pandas", "pandas", "\\bpandas\\b|\\bdataframes?\\b", "\\bpandas\\b|dataframe",
    [["Python library for data analysis / manipulation", "librar|analysis|manipulat|data", 2], ["Series and DataFrame", "series|dataframe|data frame", 2.5], ["reading csv / cleaning / filtering / groupby", "csv|excel|clean|filter|group ?by|merge|read_", 1.5]],
    [["pandas\\W+(is|are)\\W+(a )?(database|animal)", "pandas is a Python library, not a database."]],
    "pandas is a Python library for data analysis. Its main structures are Series (1-D) and DataFrame (2-D table) used to read, clean, filter, group and merge data.");
  add("numpy", "NumPy", "\\bnumpy\\b|\\bnumeric python\\b", "\\bnumpy\\b",
    [["Python library for numerical computing", "numerical|numeric|math|scientific|librar", 2.5], ["n-dimensional arrays (ndarray)", "array|ndarray|n.?dimension", 2.5], ["fast vectorised operations", "fast|vector|efficient|broadcast", 1.5]], [],
    "NumPy is a Python library for numerical computing built around fast n-dimensional arrays (ndarray) with vectorised operations.");

  // ------------------------------------------------------------------ data / ML
  add("data_science", "data science", "\\bdata science\\b|\\bwhat is (your )?data\\b", "data science|interdisciplinary",
    [["extracting insights / knowledge from data", "insight|knowledge|extract|analy[sz]|information|pattern", 2.5], ["combines statistics / mathematics", "statistic|mathematic|math", 1.5], ["combines programming / computer science", "program|computer science|coding|python", 1.5], ["uses machine learning / AI", "machine learning|artificial intelligence|\\bai\\b|\\bml\\b|model", 1.5], ["domain knowledge / business decisions", "domain|business|decision|problem", 1.5], ["data collection, cleaning, visualisation steps", "collect|clean|visuali[sz]|preprocess|wrangl", 1]], [],
    "Data science is an interdisciplinary field that uses statistics, programming and domain knowledge (often machine learning) to collect, clean, analyse and model data to extract insights and support decisions.");
  add("data_analysis", "data analysis", "\\bdata (analysis|analytics|analyst)\\b", "data analy",
    [["inspecting, cleaning and transforming data", "clean|transform|inspect|process|organi[sz]", 2], ["to find insights / patterns / trends", "insight|pattern|trend|conclusion", 2.5], ["support decision making", "decision|business|problem", 1.5], ["tools: Excel, SQL, Python, Power BI, Tableau", "excel|sql|python|power ?bi|tableau|\\br\\b", 1.5]], [],
    "Data analysis is inspecting, cleaning, transforming and modelling data to find trends and insights that support decisions, using tools such as Excel, SQL, Python, Power BI or Tableau.");
  add("machine_learning", "machine learning", "\\bmachine learning\\b|\\bwhat is (an? )?ml\\b", "machine learning",
    [["computers learn from data without being explicitly programmed", "learn.{0,30}data|without being (explicitly )?programmed|learn from", 3], ["builds models that make predictions / decisions", "model|predict|decision|pattern", 2], ["types: supervised, unsupervised, reinforcement", "supervised|unsupervised|reinforcement", 1.5]],
    [["machine learning\\W+(is|are)\\W+(the same as|same as)\\W+(ai|artificial)", "ML is a subset of AI, not the same thing."]],
    "Machine learning is a branch of AI where algorithms learn patterns from data to make predictions or decisions without being explicitly programmed. Main types: supervised, unsupervised and reinforcement learning.");
  add("supervised", "supervised vs unsupervised", "(un)?supervised", "(un)?supervised",
    [["supervised learning uses labelled data", "supervised.{0,60}label|label.{0,40}supervised", 3], ["unsupervised learning uses unlabelled data / finds patterns", "unsupervised.{0,70}(unlabel|without label|no label|pattern|cluster|group)", 3], ["examples: regression/classification vs clustering", "regression|classification|cluster|k.?means", 1.5]],
    [["(^|\\W)supervised.{0,40}(unlabel|without label|no label)", "Supervised learning uses LABELLED data."], ["unsupervised.{0,40}(uses |using |with )labell?ed", "Unsupervised learning uses UNlabelled data."]],
    "Supervised learning trains on labelled data (input and known output) for regression or classification; unsupervised learning finds patterns in unlabelled data, e.g. clustering.");
  add("overfitting", "overfitting", "\\boverfit", "overfit",
    [["the model learns the training data too well (including noise)", "too well|memori[sz]|noise|training data", 3], ["performs well on training data but poorly on new / test data", "poor.{0,30}(test|new|unseen)|new data|unseen|test data", 3], ["ways to reduce: regularisation, more data, cross-validation, simpler model", "regulari[sz]|more data|cross.?valid|simpl|dropout|prun|early stop", 1.5]],
    [["overfit\\w*.{0,40}(poor|bad|low).{0,15}training", "Overfitting means GOOD performance on training data but poor on new data."]],
    "Overfitting is when a model memorises the training data and its noise, so it scores well on training data but badly on new data. Reduce it with more data, regularisation, cross-validation or a simpler model.");
  add("p_value", "p-value / hypothesis testing", "\\b(p.?values?|hypothesis|null hypothesis|statistical(ly)? significan\\w*|significance level)\\b", "\\bp.?value|null hypothesis|significan",
    [["p-value = probability of a result at least this extreme if the null hypothesis is true", "probabilit|chance|likelihood|extreme|as extreme|evidence", 3], ["p-value below 0.05 (alpha) = statistically significant: reject the null hypothesis", "0\\.05|5 ?%|alpha|significan|reject", 3], ["used in hypothesis testing", "hypothesis|test", 1.5]],
    [["p.?value.{0,30}(probability|chance) that (the )?(null|hypothesis) is (true|correct)", "The p-value is not the probability that the null hypothesis is true."]],
    "The p-value is the probability of getting a result at least as extreme as the observed one if the null hypothesis is true. If p is below the significance level (usually 0.05) the result is statistically significant and we reject the null hypothesis.");
  add("data_visualization", "data visualization", "\\bdata visuali[sz]ation\\b|\\bvisuali[sz]ation\\b", "visuali[sz]ation|chart|graph",
    [["showing data as charts / graphs", "chart|graph|plot|dashboard|visual", 3], ["helps see patterns, trends and outliers quickly", "pattern|trend|insight|outlier|understand|communicate", 2], ["tools such as Matplotlib, Seaborn, Power BI, Tableau", "matplotlib|seaborn|power ?bi|tableau|excel|plotly", 1.5]], [],
    "Data visualization shows data as charts and graphs (bar, line, scatter, histogram) so patterns, trends and outliers are easy to see and share. Common tools: Matplotlib, Seaborn, Plotly, Power BI, Tableau.");
  add("underfitting", "underfitting", "\\bunderfit", "underfit",
    [["the model is too simple to capture the pattern", "too simple|simple|not (learn|capture)|miss", 3], ["poor performance on both training and test data", "both|training.{0,20}(poor|bad)|poor", 2.5]], [],
    "Underfitting is when a model is too simple to learn the pattern, so it performs poorly on both training and test data.");
  add("bias_variance", "bias-variance tradeoff", "bias.{0,10}variance", "bias.{0,10}variance",
    [["high bias = underfitting (too simple)", "bias.{0,40}(underfit|simple)", 2.5], ["high variance = overfitting (too sensitive to training data)", "variance.{0,40}(overfit|sensitive)", 2.5], ["a balance between the two", "balance|tradeoff|trade.?off", 1.5]], [],
    "High bias means the model is too simple (underfits); high variance means it is too sensitive to the training data (overfits). The goal is a balance between them.");
  add("linear_regression", "linear regression", "\\blinear regression\\b", "linear regression",
    [["predicts a continuous (numeric) value", "continuous|numeric|number|predict", 2.5], ["fits a straight line between input and output variables", "straight line|line|linear relationship", 2.5], ["equation y = mx + c / coefficients", "y ?= ?m ?x|slope|intercept|coefficient", 1.5]],
    [["linear regression.{0,40}(classif|categor)", "Linear regression predicts numbers; classification is for categories (logistic regression)."]],
    "Linear regression models the relationship between input variables and a continuous target with a straight line, y = mx + c, and is used to predict numbers.");
  add("logistic_regression", "logistic regression", "\\blogistic regression\\b", "logistic",
    [["used for classification (yes/no, binary)", "classif|binary|yes.{0,5}no|categor|probabilit", 3], ["uses the sigmoid function to output a probability", "sigmoid|probabilit|0 and 1", 2.5]],
    [["logistic regression.{0,40}(predict|for) (continuous|numeric|price)", "Logistic regression is for classification, not predicting continuous numbers."]],
    "Logistic regression is a classification algorithm that uses the sigmoid function to output a probability between 0 and 1, typically for binary outcomes.");
  add("classification_regression", "classification vs regression", "classification.{0,25}regression|regression.{0,25}classification", "",
    [["classification predicts categories / classes", "classification.{0,50}(categor|class|label)", 3], ["regression predicts continuous numeric values", "regression.{0,50}(continuous|numeric|number|value)", 3]], [],
    "Classification predicts a category (spam / not spam); regression predicts a continuous number (house price).");
  add("clustering", "clustering / k-means", "\\bclustering\\b|k.?means", "cluster",
    [["groups similar data points together", "group|similar|cluster", 3], ["unsupervised learning (no labels)", "unsupervised|no label|unlabel", 2], ["k-means: k clusters around centroids", "centroid|k.?means|\\bk\\b", 1.5]], [],
    "Clustering is unsupervised learning that groups similar data points; k-means forms k clusters around centroids.");
  add("decision_tree", "decision tree / random forest", "decision tree|random forest", "decision tree|random forest",
    [["tree-like model of decisions / splits on features", "tree|split|node|branch|leaf|decision", 3], ["random forest = many trees combined (ensemble)", "many trees|multiple trees|ensemble|forest|vote|average", 2], ["used for classification and regression", "classif|regression", 1.5]], [],
    "A decision tree splits data on feature questions down to leaf predictions; a random forest combines many trees (ensemble) and takes the majority vote or average to be more accurate.");
  add("cross_validation", "cross-validation", "cross.?validation", "cross.?valid",
    [["split data into several folds, train and test on different parts", "fold|split|part|subset", 3], ["gives a more reliable estimate of performance / reduces overfitting", "reliable|estimate|overfit|generali[sz]|performance", 2.5]], [],
    "Cross-validation splits the data into k folds, trains on k-1 and tests on the remaining fold in turn, giving a more reliable estimate of how the model generalises.");
  add("confusion_matrix", "precision / recall / confusion matrix", "precision|recall|confusion matrix|f1", "precision|recall|confusion",
    [["precision = correct positives out of all predicted positives", "precision.{0,60}(predicted|positive)", 2.5], ["recall = correct positives out of all actual positives", "recall.{0,60}(actual|positive|real)", 2.5], ["confusion matrix: TP, FP, TN, FN", "true positive|false positive|true negative|false negative|\\btp\\b|\\bfp\\b|\\bfn\\b", 1.5]], [],
    "Precision = TP / (TP + FP); recall = TP / (TP + FN). A confusion matrix shows true/false positives and negatives.");
  add("normalization", "normalization / standardization (scaling)", "(feature )?(scaling|standardi[sz]ation)|min.?max|normali[sz]ation(?!.{0,30}(database|dbms|sql|table))", "scaling|standardi",
    [["brings features to a similar scale / range", "scale|range|same level|similar", 3], ["normalization rescales to 0-1 (min-max)", "0 (to|and) 1|min.?max|between 0", 2], ["standardization: mean 0 and standard deviation 1", "mean.{0,10}0|standard deviation|z.?score", 2]], [],
    "Scaling puts features on a similar scale. Normalisation (min-max) rescales values to 0-1; standardisation transforms them to mean 0 and standard deviation 1.");
  add("missing_values", "handling missing values", "missing (values|data)|null values|\\bimput", "missing|imput|null",
    [["remove rows / columns with missing values", "remov|drop|delet", 2], ["fill (impute) with mean / median / mode", "mean|median|mode|imput|fill|replace", 3], ["check why the data is missing / use models", "why|reason|predict|model|forward fill|interpolat", 1]], [],
    "Missing values can be dropped, or filled (imputed) with the mean, median, mode, a constant or a model prediction, depending on how much is missing and why.");
  add("outliers", "outliers", "\\boutliers?\\b", "outlier",
    [["data points far from the rest", "far|different|extreme|unusual|abnormal|deviat", 3], ["detect with IQR / z-score / box plot", "iqr|z.?score|box ?plot|standard deviation", 2], ["handle: remove, cap or transform", "remov|cap|transform|winsor", 1.5]], [],
    "Outliers are values far from the others. Detect them with box plots, IQR or z-scores, then remove, cap or transform them depending on whether they are errors or real.");
  add("eda", "EDA", "\\beda\\b|exploratory data analysis", "exploratory",
    [["exploring data to understand patterns before modelling", "explor|understand|summar|pattern|before", 3], ["uses summary statistics and visualisation", "statistic|visuali[sz]|plot|chart|histogram|describe", 2.5], ["finding missing values / outliers / correlations", "missing|outlier|correlat|distribution", 1.5]], [],
    "EDA (exploratory data analysis) means summarising and visualising a dataset to understand its structure, distributions, missing values, outliers and relationships before modelling.");
  add("neural_network", "neural network / deep learning", "neural network|deep learning", "neural|deep learning",
    [["layers of connected neurons inspired by the brain", "neuron|layer|brain|node", 3], ["learns by adjusting weights (backpropagation)", "weight|backprop|learn|train", 2], ["input, hidden and output layers", "input|hidden|output", 1.5]], [],
    "A neural network is made of layers of connected neurons (input, hidden, output) that learn by adjusting weights through backpropagation; deep learning uses many hidden layers.");
  add("correlation", "correlation", "\\bcorrelation\\b", "correlation",
    [["measures the relationship between two variables", "relationship|related|between (two|2)|together|move", 3], ["value from -1 to +1", "-1|minus 1|\\+1|plus 1|between -?1", 2], ["correlation is not causation", "causation|cause", 1.5]], [],
    "Correlation measures how strongly two variables move together, from -1 to +1. It does not prove that one causes the other.");
  add("mean_median_mode", "mean, median, mode", "\\b(mean|median|mode)\\b", "mean.{0,20}median|median.{0,20}mode",
    [["mean = average", "average|sum.{0,15}divid", 2], ["median = middle value", "middle|center|centre", 2], ["mode = most frequent value", "most (frequent|common|often)|frequent", 2]], [],
    "Mean is the average, median is the middle value when sorted, and mode is the most frequent value.");

  // ------------------------------------------------------------------ SQL / databases
  add("sql", "SQL", "\\b(what is|explain|define|about)\\b.{0,15}\\bsql\\b|^sql\\b|structured query", "structured query",
    [["Structured Query Language", "structured query", 1.5], ["language to store, retrieve and manage data in relational databases", "database|data|query|retriev|manage|manipulat", 3], ["commands: SELECT, INSERT, UPDATE, DELETE", "select|insert|update|delete|create", 1.5], ["works with tables", "table|relational|rdbms", 1.5]],
    [["sql\\W+(is|are)\\W+(a )?(database|software|server)\\b", "SQL is a language used to talk to a database, not a database itself."]],
    "SQL (Structured Query Language) is the standard language for storing, retrieving, updating and managing data in relational databases, using commands like SELECT, INSERT, UPDATE and DELETE on tables.");
  add("joins", "SQL joins", "\\bjoins?\\b", "(inner|left|right|full|outer).{0,10}join",
    [["combine rows from two or more tables using a related column", "combine|related|common column|key|match|two tables|multiple tables", 3], ["inner join returns matching rows only", "inner", 2], ["left / right / full outer join keep unmatched rows", "left|right|full|outer", 2]], [],
    "A JOIN combines rows from two tables using a related column. INNER JOIN returns only matching rows; LEFT / RIGHT / FULL OUTER JOIN also keep unmatched rows from one or both sides.");
  add("primary_key", "primary key", "primary key", "primary key",
    [["uniquely identifies each row", "unique|identif", 3], ["cannot be NULL", "null|empty|blank", 2], ["only one per table", "one (per|in) table|single|only one", 1]],
    [["primary key.{0,40}\\b(can|may)\\b\\W+(?:(?:be|have|contain|accept|store|hold)\\W+)?(?:a\\W+|any\\W+|some\\W+)?(?:null|duplicate)", "A primary key can never be NULL or duplicated."]],
    "A primary key uniquely identifies every row in a table; it cannot be NULL or duplicated, and a table has only one.");
  add("foreign_key", "foreign key", "foreign key", "foreign key",
    [["a column that refers to the primary key of another table", "refer|another table|primary key|link|reference", 3], ["creates a relationship between tables / referential integrity", "relationship|integrity|connect|link", 2]], [],
    "A foreign key is a column that references the primary key of another table, linking the tables and enforcing referential integrity.");
  add("where_having", "WHERE vs HAVING", "where.{0,15}having|having.{0,15}where", "",
    [["WHERE filters rows before grouping", "where.{0,50}(row|before|filter)", 3], ["HAVING filters groups after GROUP BY / aggregates", "having.{0,60}(group|after|aggregate)", 3]], [],
    "WHERE filters individual rows before grouping; HAVING filters groups after GROUP BY, so it can use aggregate functions like COUNT or SUM.");
  add("delete_truncate", "DELETE vs TRUNCATE vs DROP", "delete.{0,20}(truncate|drop)|truncate", "truncate",
    [["DELETE removes selected rows (with WHERE) and can be rolled back", "delete.{0,60}(where|row|rollback|roll back)", 2.5], ["TRUNCATE removes all rows quickly, keeps the table", "truncate.{0,60}(all|quick|fast|structure|keep)", 2.5], ["DROP removes the whole table", "drop.{0,50}(table|structure|entire|whole|completely)", 2.5]], [],
    "DELETE removes chosen rows and can be rolled back; TRUNCATE quickly removes all rows but keeps the table structure; DROP deletes the table itself.");
  add("normalization_db", "database normalization", "normali[sz]ation.{0,30}(database|dbms|sql|table)|(database|dbms).{0,30}normali[sz]ation|\\b(1nf|2nf|3nf)\\b", "1nf|2nf|3nf",
    [["organising tables to reduce redundancy / duplicate data", "redundan|duplicat|repeat", 3], ["normal forms 1NF, 2NF, 3NF", "1nf|2nf|3nf|normal form", 2], ["improves data integrity", "integrity|consisten|anomal", 1.5]], [],
    "Database normalisation organises data into related tables to remove redundancy and anomalies, following normal forms (1NF, 2NF, 3NF).");
  add("acid", "ACID properties", "\\bacid\\b", "atomicity",
    [["Atomicity", "atomic", 2], ["Consistency", "consisten", 2], ["Isolation", "isolat", 2], ["Durability", "durab", 2]], [],
    "ACID = Atomicity (all or nothing), Consistency (valid state), Isolation (transactions do not interfere), Durability (committed data persists).");
  add("index", "database index", "\\b(database |sql )?index(es)?\\b.{0,20}(database|sql|table|what)|what is (an )?index", "index.{0,30}(search|faster|lookup)",
    [["speeds up data retrieval / searching", "fast|speed|quick|search|retriev|lookup", 3], ["a data structure on column(s)", "data structure|column|b.?tree|pointer", 1.5], ["slows down inserts / uses extra space", "slow|space|overhead|insert", 1]], [],
    "An index is a data structure on one or more columns that speeds up searches, at the cost of extra storage and slower inserts and updates.");
  add("union", "UNION vs UNION ALL", "union", "union",
    [["UNION removes duplicates", "union.{0,50}(duplicate|distinct|unique)", 3], ["UNION ALL keeps duplicates", "union all.{0,50}(duplicate|all rows|keep)", 3]], [],
    "UNION combines results and removes duplicates; UNION ALL keeps every row including duplicates and is faster.");
  add("dbms_rdbms", "DBMS vs RDBMS", "dbms.{0,15}rdbms|rdbms", "rdbms",
    [["DBMS stores data as files / generally no relations", "dbms.{0,50}(file|single user|no relation)", 2.5], ["RDBMS stores data in related tables using keys", "rdbms.{0,60}(table|relation|key)", 3]], [],
    "A DBMS manages data (often as files) without necessarily relating it; an RDBMS stores data in related tables linked by keys and supports SQL (MySQL, PostgreSQL).");
  add("excel_vlookup", "VLOOKUP / pivot table", "vlookup|pivot table|xlookup", "vlookup|pivot",
    [["VLOOKUP searches a value in the first column and returns a value from another column", "vlookup.{0,70}(search|find|look|first column|return)", 3], ["pivot table summarises / groups data quickly", "pivot.{0,70}(summar|group|aggregate|analy[sz]e)", 3]], [],
    "VLOOKUP finds a value in the first column of a range and returns a value from another column in the same row. A pivot table summarises and groups large data (sum, count, average) without formulas.");

  // ------------------------------------------------------------------ web / dev / CS
  add("html", "HTML", "\\bhtml\\b", "\\bhtml\\b",
    [["HyperText Markup Language", "hyper ?text|markup", 2], ["structure / skeleton of a web page", "structure|skeleton|content|web ?page|website", 3], ["uses tags / elements", "tag|element", 1.5]], [],
    "HTML (HyperText Markup Language) defines the structure and content of a web page using tags and elements.");
  add("css", "CSS", "\\bcss\\b", "\\bcss\\b",
    [["Cascading Style Sheets", "cascading|style ?sheet", 2], ["styles / designs the look of a web page", "style|design|look|layout|colou?r|format", 3]], [],
    "CSS (Cascading Style Sheets) controls the look and layout of HTML elements: colours, fonts, spacing and responsiveness.");
  add("javascript", "JavaScript", "\\bjava ?script\\b|\\bjs\\b", "java ?script",
    [["programming language of the web, makes pages interactive", "interactive|dynamic|web|browser|client", 3], ["runs in the browser (and Node.js on servers)", "browser|node", 2]],
    [["java ?script.{0,25}(same as|is java|is the same)", "JavaScript and Java are different languages."]],
    "JavaScript is the scripting language of the web that makes pages interactive in the browser, and with Node.js it also runs on servers. It is not the same as Java.");
  add("var_let_const", "var, let, const", "\\b(var|let|const)\\b.{0,25}\\b(var|let|const)\\b", "",
    [["var is function-scoped", "var.{0,40}(function|global)", 2.5], ["let is block-scoped and reassignable", "let.{0,40}(block|reassign|change)", 2.5], ["const is block-scoped and cannot be reassigned", "const.{0,40}(constant|cannot|can't|not (be )?(reassign|change))", 2.5]], [],
    "var is function-scoped and hoisted; let is block-scoped and can be reassigned; const is block-scoped and cannot be reassigned.");
  add("api_rest", "REST API", "\\b(rest|restful)?\\s*api\\b", "\\bapi\\b",
    [["Application Programming Interface: lets two software systems talk", "application programming interface|communicat|talk|interact|connect|between", 3], ["request and response (usually JSON)", "request|response|json|http|endpoint", 2], ["REST uses HTTP methods GET, POST, PUT, DELETE", "get|post|put|delete|http method", 1.5]], [],
    "An API (Application Programming Interface) lets software systems communicate. A REST API exposes endpoints used with HTTP methods (GET, POST, PUT, DELETE) and usually exchanges JSON.");
  add("http_https", "HTTP vs HTTPS", "https?\\b.{0,20}https?\\b|difference between http", "",
    [["HTTP is the protocol of the web, unencrypted", "http.{0,60}(protocol|not (secure|encrypt)|plain|unsecure|insecure)", 3], ["HTTPS adds encryption with SSL / TLS", "https.{0,60}(secure|encrypt|ssl|tls|certificate)", 3]], [],
    "HTTP transfers web data without encryption; HTTPS is HTTP over SSL/TLS so data is encrypted and the site is authenticated.");
  add("git", "Git", "\\bgit\\b|\\bgithub\\b|version control", "\\bgit\\b|version control",
    [["version control system that tracks changes", "version control|track|history|change", 3], ["commit, branch, merge", "commit|branch|merge|push|pull|clone", 2.5], ["Git is local, GitHub hosts repositories online", "github|remote|repository|local", 1]],
    [["git\\W+(is|are)\\W+(the same as|same as)\\W+github", "Git is the tool; GitHub is a website that hosts Git repositories."]],
    "Git is a distributed version control system that tracks changes in code. You commit changes, use branches and merge them; GitHub hosts Git repositories online.");
  add("array_linkedlist", "array vs linked list", "array.{0,20}linked list|linked list", "linked list",
    [["array: contiguous memory, fast access by index", "array.{0,60}(contiguous|index|fast|random access)", 3], ["linked list: nodes with pointers, easy insert / delete", "linked.{0,60}(node|pointer|insert|delet|dynamic)", 3]], [],
    "An array stores items in contiguous memory with O(1) access by index; a linked list stores nodes connected by pointers, so inserting or deleting is easy but access is O(n).");
  add("stack_queue", "stack vs queue", "stack.{0,20}queue|queue.{0,20}stack|\\bstacks?\\b|\\bqueues?\\b", "lifo|fifo",
    [["stack is LIFO (last in, first out)", "lifo|last in.{0,5}first out", 3], ["queue is FIFO (first in, first out)", "fifo|first in.{0,5}first out", 3], ["push / pop and enqueue / dequeue", "push|pop|enqueue|dequeue", 1]],
    [["stack.{0,25}fifo", "A stack is LIFO, not FIFO."], ["queue.{0,25}lifo", "A queue is FIFO, not LIFO."]],
    "A stack is LIFO (last in, first out) with push and pop; a queue is FIFO (first in, first out) with enqueue and dequeue.");
  add("big_o", "time complexity / Big O", "big.?o|time complexity|space complexity", "big.?o|complexity",
    [["measures how running time / memory grows with input size", "grow|input size|scale|time|efficien", 3], ["examples: O(1), O(n), O(log n), O(n^2)", "o\\(|constant|linear|logarithm|quadratic", 2]], [],
    "Big O describes how an algorithm's running time or memory grows with input size, e.g. O(1) constant, O(log n), O(n) linear, O(n^2) quadratic.");
  add("process_thread", "process vs thread", "process.{0,20}thread|thread.{0,20}process", "",
    [["a process is a running program with its own memory", "process.{0,60}(program|own memory|separate|independent)", 3], ["threads are lighter units inside a process that share memory", "thread.{0,60}(share|within|inside|light)", 3]], [],
    "A process is a running program with its own memory space; threads are lightweight units of execution inside a process that share its memory.");
  add("tcp_udp", "TCP vs UDP", "tcp.{0,20}udp|udp.{0,20}tcp", "",
    [["TCP is reliable, connection-oriented, ordered", "tcp.{0,60}(reliable|connection|order|handshake)", 3], ["UDP is faster but connectionless / no guarantee", "udp.{0,60}(fast|connectionless|no guarantee|unreliable|streaming)", 3]],
    [["udp.{0,20}\\breliable\\b(?!.{0,5}(not|no))", "UDP is not reliable; TCP is."]],
    "TCP is connection-oriented and reliable (ordered, acknowledged delivery); UDP is connectionless and faster but gives no delivery guarantee, used for streaming and gaming.");
  add("cloud", "cloud computing", "cloud computing|\\baws\\b|\\bazure\\b", "cloud",
    [["delivering computing services over the internet", "internet|online|remote|servers?|service", 3], ["pay as you use / scalable", "pay|scal|on.?demand", 2], ["IaaS, PaaS, SaaS", "iaas|paas|saas", 1.5]], [],
    "Cloud computing delivers servers, storage, databases and software over the internet on demand, pay-as-you-go and scalable (IaaS, PaaS, SaaS).");
  add("docker", "Docker", "\\bdocker\\b|\\bcontainers?\\b", "docker|container",
    [["packages an application with its dependencies in a container", "package|dependenc|container", 3], ["lightweight and portable (runs the same everywhere)", "light|portable|same everywhere|any (machine|environment)|consistent", 2]], [],
    "Docker packages an application with its dependencies into a lightweight, portable container that runs the same on any machine.");

  // ------------------------------------------------------------------ v44: topics asked in real interviews
  add("imbalanced_data", "imbalanced data", "\\b(imbalance|imbalanced|unbalanced|class imbalance)\\b", "class.{0,30}(more|fewer|less) samples|oversampl|undersampl|smote",
    [["one class has far more samples than the other", "one class|more samples|fewer|minority|majority|skew|unequal|not equal|more than (the )?other", 3], ["techniques: oversampling / undersampling / SMOTE / class weights", "oversampl|over.?sampl|undersampl|under.?sampl|smote|class weight|resampl", 2.5], ["the model becomes biased to the majority class", "bias|majority", 1], ["use precision / recall / F1 instead of accuracy", "precision|recall|f1|f-1|auc|roc", 1]], [],
    "Imbalanced data means one class has many more samples than another (e.g. 95% non-fraud, 5% fraud), so a model can look accurate while ignoring the minority class. Fix it with oversampling (SMOTE), undersampling, class weights, and judge it with precision, recall and F1, not accuracy.");
  add("long_wide", "long format vs wide format data", "\\b(long|wide)\\b.{0,25}\\b(format|data|table)\\b|\\b(format|data|table)\\b.{0,25}\\b(long|wide)\\b", "",
    [["long format: each row is one observation, variables are stored in rows (key-value style)", "long.{0,80}(each row|one observation|rows?)|variables?.{0,20}(in|as|stored in) rows|stacked", 3], ["wide format: each row is one subject, variables are in separate columns", "wide.{0,80}(column|each row|one (subject|observation|record))|separate columns|different columns", 3], ["convert with pivot / melt", "pivot|melt|reshape|stack|unstack", 1]], [],
    "In long format each row is one observation and the variables are stacked in rows (columns like id, variable, value). In wide format each row is one subject and every variable has its own column. pandas converts them with melt (wide to long) and pivot (long to wide).");
  add("analyst_vs_scientist", "data analyst vs data scientist", "\\b(analyst|analytics)\\b.{0,40}\\b(scientist|science)\\b|\\b(scientist|science)\\b.{0,40}\\b(analyst|analytics)\\b", "",
    [["a data analyst analyses existing data to find insights (reports, dashboards)", "analy.{0,30}(existing|past|historical|data|insight|report|dashboard)", 2.5], ["a data scientist builds models to predict / solve complex problems (machine learning)", "machine learning|model|predict|algorithm|complex|forecast|statistic", 2.5], ["tools: SQL / Excel / BI vs Python / statistics / ML", "sql|excel|tableau|power ?bi|python|statistic", 1]], [],
    "A data analyst analyses existing data with SQL, Excel and BI tools to find insights and build reports. A data scientist goes further: uses statistics, programming and machine learning to build predictive models and solve complex problems.");

  // ------------------------------------------------------------------ helpers
  const FIX = [[/\bbeta science\b/g, "data science"], [/\bdata sciences\b/g, "data science"], [/\bpie ?thon\b/g, "python"], [/\bpy ?thon\b/g, "python"], [/\bsequel\b/g, "sql"], [/\bs q l\b/g, "sql"], [/\bj ?son\b/g, "json"], [/\bnum ?pie\b/g, "numpy"], [/\bnumb pie\b/g, "numpy"], [/\bpanda'?s\b/g, "pandas"], [/\bdata ?frames?\b/g, "dataframe"], [/\bk ?means\b/g, "k-means"], [/\bjava script\b/g, "javascript"], [/\btupple\b|\btuple's\b/g, "tuple"], [/\binterdisciplinary (fleet|feel|filled)\b/g, "interdisciplinary field"], [/\bmutual\b/g, "mutable"], [/\bimmutual\b/g, "immutable"], [/\bdiction ?ary\b/g, "dictionary"]];
  const norm = (s) => { let t = String(s || "").toLowerCase().replace(/[“”"']/g, "'").replace(/\s+/g, " "); for (const [r, v] of FIX) t = t.replace(r, v); return t; };
  const cueOnly = (q) => { const w = String(q || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x && !/^(what|is|are|the|a|an|explain|define|tell|me|about|difference|between|and|of|in|your|you|can|do|how|why|please|question|not|captured|interviewer|voice|was|recognised|recognized)$/.test(x)); return cueWords(w); };
  const cueWords = (w) => w.length === 0;

  function score(topic, ans) {
    const hit = [], miss = []; let got = 0, tot = 0;
    for (const [label, re, w] of topic.concepts) { tot += w; if (re.test(ans)) { got += w; hit.push(label); } else miss.push(label); }
    const need = Math.max(1, 0.6 * tot), coverage = Math.min(1, got / need);
    const hitW = topic.wrong.filter(([re]) => re.test(ans)), wrong = hitW.filter((w) => !w[2]).map((w) => w[1]), notes = hitW.filter((w) => w[2]).map((w) => w[1]);
    return { hit, miss, coverage, wrong, notes, got, tot };
  }
  /** question + answer -> { topic, inferred, coverage, verdict, hit, miss, wrong, ref } or null when no topic is known */
  function check(question, answer) {
    const ans = norm(answer), q = norm(question);
    if (!ans.trim()) return null;
    let topic = null, inferred = false;
    const nc = q.match(/^\(question not captured - the answer is about: ([^)]+)\)/); // v35: the parser already found the topic of an un-captured question
    if (nc) { topic = T.find((t) => t.name.toLowerCase() === nc[1].trim()) || null; inferred = !!topic; }
    else if (!cueOnly(q) && !/^\(question not captured/.test(q)) topic = T.find((t) => t.q.test(q)) || null;
    if (!topic) { // question text cut / not captured / not in the bank: find the topic the ANSWER is about (needs 2 clear hits)
      let best = null, bs = 0;
      for (const t of T) { const hits = t.concepts.filter(([, re]) => re.test(ans)).length + (t.a && t.a.test(ans) ? 2 : 0); if (hits > bs) { bs = hits; best = t; } }
      if (best && bs >= 3) { topic = best; inferred = true; }
    }
    if (!topic) return null;
    const s = score(topic, ans);
    let level = s.coverage >= 0.85 ? 2 : s.coverage >= 0.45 ? 1 : 0;
    if (s.wrong.length) level = Math.max(0, level - 1);
    if (s.wrong.length >= 2 && s.coverage < 0.8) level = 0;
    const verdict = ["Incorrect", "Partially correct", "Correct"][level];
    return { topic: topic.name, id: topic.id, inferred, coverage: Math.round(s.coverage * 100) / 100, verdict, hit: s.hit, miss: s.miss, wrong: s.wrong, notes: s.notes, ref: topic.ref };
  }
  const API = { check, topics: T, norm, add };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Knowledge = API;
})(typeof window !== "undefined" ? window : globalThis);
