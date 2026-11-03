// Evergreen demo content, loaded only when SEED_SAMPLE=true and the question bank is empty.
// [text, [A,B,C,D], correctIndex, explanation, subject, topic, difficulty]
export const SAMPLE_QUESTIONS = [
  ['Which river is known as the lifeline of Kashmir?', ['Jhelum', 'Chenab', 'Ravi', 'Tawi'], 0, 'The Jhelum flows through the Kashmir Valley and is its principal river.', 'J&K Geography', 'Rivers', 'easy'],
  ['Which pass connects Srinagar with Leh?', ['Banihal', 'Zoji La', 'Khardung La', 'Pir Panjal'], 1, 'Zoji La connects the Kashmir Valley with Ladakh.', 'J&K Geography', 'Passes', 'moderate'],
  ['Dal Lake is located in which city?', ['Jammu', 'Anantnag', 'Srinagar', 'Baramulla'], 2, 'Dal Lake is a famous lake in Srinagar.', 'J&K Geography', 'Lakes', 'easy'],
  ['Wular Lake lies in which district?', ['Bandipora', 'Kupwara', 'Pulwama', 'Budgam'], 0, 'Wular Lake, one of Asia’s largest freshwater lakes, is in Bandipora.', 'J&K Geography', 'Lakes', 'difficult'],
  ['Who is the constitutional head of an Indian state?', ['Chief Minister', 'Governor', 'Speaker', 'Chief Justice'], 1, 'The Governor is the head of the state executive.', 'Indian Polity', 'State Government', 'easy'],
  ['Article 21 of the Indian Constitution deals with:', ['Right to equality', 'Freedom of speech', 'Protection of life and personal liberty', 'Right to education'], 2, 'Article 21 guarantees protection of life and personal liberty.', 'Indian Polity', 'Fundamental Rights', 'moderate'],
  ['Who appoints the Chief Justice of India?', ['Prime Minister', 'President', 'Parliament', 'Law Minister'], 1, 'The President appoints the Chief Justice of India.', 'Indian Polity', 'Judiciary', 'easy'],
  ['What is the minimum age to become President of India?', ['25 years', '30 years', '35 years', '40 years'], 2, 'A candidate must be at least 35 years old (Article 58).', 'Indian Polity', 'Union Executive', 'moderate'],
  ['Fundamental Duties were added to the Constitution by which Amendment?', ['24th', '42nd', '44th', '73rd'], 1, 'The 42nd Amendment (1976) added Fundamental Duties.', 'Indian Polity', 'Amendments', 'moderate'],
  ['In which year was the Battle of Plassey fought?', ['1757', '1764', '1857', '1699'], 0, 'The Battle of Plassey took place in 1757.', 'Indian History', 'Modern India', 'easy'],
  ['Who founded the Mughal Empire in India?', ['Akbar', 'Humayun', 'Babur', 'Shah Jahan'], 2, 'Babur founded the Mughal Empire after the First Battle of Panipat (1526).', 'Indian History', 'Medieval India', 'easy'],
  ['The Quit India Movement was launched in:', ['1930', '1942', '1919', '1947'], 1, 'Gandhi launched the Quit India Movement in August 1942.', 'Indian History', 'Freedom Struggle', 'easy'],
  ['Which is the largest Indian state by area?', ['Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Uttar Pradesh'], 2, 'Rajasthan is the largest state by area.', 'Geography', 'India', 'easy'],
  ['The Tropic of Cancer passes through which of these states?', ['Gujarat', 'Kerala', 'Punjab', 'Tamil Nadu'], 0, 'It passes through eight states including Gujarat and Rajasthan.', 'Geography', 'India', 'moderate'],
  ['What is the SI unit of force?', ['Joule', 'Pascal', 'Newton', 'Watt'], 2, 'Force is measured in newtons (N).', 'General Science', 'Physics', 'easy'],
  ['What is the chemical symbol of sodium?', ['So', 'Sd', 'Na', 'S'], 2, 'Sodium’s symbol Na comes from the Latin “natrium”.', 'General Science', 'Chemistry', 'easy'],
  ['Which vitamin is synthesised in the skin by sunlight?', ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin K'], 2, 'Sunlight triggers vitamin D synthesis in the skin.', 'General Science', 'Biology', 'easy'],
  ['What is 15% of 200?', ['20', '25', '30', '35'], 2, '15/100 × 200 = 30.', 'Quantitative Aptitude', 'Percentages', 'easy'],
  ['Find the next number: 2, 6, 12, 20, 30, ?', ['38', '40', '42', '44'], 2, 'Differences are 4, 6, 8, 10, so the next is +12 → 42.', 'Quantitative Aptitude', 'Series', 'moderate'],
  ['A car travels at 60 km/h. How long will it take to cover 150 km?', ['2 hours', '2.5 hours', '3 hours', '3.5 hours'], 1, 'Time = 150 ÷ 60 = 2.5 hours.', 'Quantitative Aptitude', 'Time and Distance', 'easy'],
  ['Simple interest on ₹5000 at 10% per annum for 2 years is:', ['₹500', '₹1000', '₹1100', '₹1500'], 1, 'SI = 5000 × 10 × 2 / 100 = ₹1000.', 'Quantitative Aptitude', 'Interest', 'easy'],
  ['Find the odd one out: Apple, Mango, Potato, Banana', ['Apple', 'Mango', 'Potato', 'Banana'], 2, 'Potato is a vegetable; the others are fruits.', 'Reasoning', 'Odd One Out', 'easy'],
  ['A is B’s sister. B is C’s father. How is A related to C?', ['Mother', 'Aunt', 'Sister', 'Cousin'], 1, 'A is the sister of C’s father, so she is C’s aunt.', 'Reasoning', 'Blood Relations', 'moderate'],
  ['Choose the synonym of “Abundant”.', ['Scarce', 'Plentiful', 'Tiny', 'Rare'], 1, 'Abundant means existing in large quantities — plentiful.', 'English', 'Synonyms', 'easy'],
  ['Choose the antonym of “Ancient”.', ['Old', 'Historic', 'Modern', 'Antique'], 2, 'The opposite of ancient is modern.', 'English', 'Antonyms', 'easy'],
  ['One word for “a person who loves books”:', ['Bibliophile', 'Philanthropist', 'Bibliographer', 'Linguist'], 0, 'A bibliophile is a lover of books.', 'English', 'One Word Substitution', 'moderate'],
  ['What is the full form of CPU?', ['Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Control Processing Utility'], 1, 'CPU stands for Central Processing Unit.', 'Computer Awareness', 'Basics', 'easy'],
];

export const SAMPLE_NOTE = {
  title: 'Welcome to Learnace',
  category: 'Announcements',
  body: 'This is sample content. Sign in as an admin to add your own questions, tests, study material and current affairs from the Admin panel.',
};
