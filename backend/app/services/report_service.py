from sqlalchemy.orm import Session

from app.models.answer import Answer
from app.models.question import Question
from app.models.score import Score
from app.models.report import Report


def generate_interview_report(
    db: Session,
    session_id,
):
    # =========================================================
    # GET ALL ANSWERS
    # =========================================================

    answers = (
        db.query(Answer)
        .filter(
            Answer.session_id == session_id
        )
        .order_by(
            Answer.answered_at.asc(),
            Answer.id.asc(),
        )
        .all()
    )

    if not answers:

        raise ValueError(
            "No answers found for this interview session."
        )

    # =========================================================
    # GET QUESTIONS
    #
    # Used to identify:
    #
    # Main Question
    # Follow-up Question
    # =========================================================

    question_ids = [
        answer.question_id
        for answer in answers
    ]

    questions = (
        db.query(Question)
        .filter(
            Question.id.in_(question_ids)
        )
        .all()
    )

    question_map = {
        question.id: question
        for question in questions
    }

    # =========================================================
    # BUILD MAIN QUESTION ANSWER GROUPS
    #
    # Example:
    #
    # Main Q1
    #   Answer A1
    #
    # Follow-up Q1
    #   Answer A2
    #
    # Both belong to Main Q1.
    # =========================================================

    main_question_answers = {}

    for answer in answers:

        question = question_map.get(
            answer.question_id
        )

        if question is None:
            continue

        # -----------------------------------------------------
        # Determine main question
        # -----------------------------------------------------

        if question.parent_question_id is None:

            main_question_id = (
                question.id
            )

        else:

            main_question_id = (
                question.parent_question_id
            )

        # -----------------------------------------------------
        # Keep latest answer for this main question
        #
        # Because answers are ordered by answered_at + id,
        # later answers overwrite earlier answers.
        # -----------------------------------------------------

        main_question_answers[
            main_question_id
        ] = answer

    # =========================================================
    # FINAL ANSWERS
    # =========================================================

    final_answer_ids = [
        answer.id
        for answer
        in main_question_answers.values()
    ]

    if not final_answer_ids:

        raise ValueError(
            "No final answers found for this interview session."
        )

    # =========================================================
    # GET SCORES
    # =========================================================

    scores = (
        db.query(Score)
        .filter(
            Score.answer_id.in_(
                final_answer_ids
            )
        )
        .all()
    )

    if not scores:

        raise ValueError(
            "No evaluation scores found for this interview session."
        )

    # =========================================================
    # SCORE MAP
    # =========================================================

    score_map = {
        score.answer_id: score
        for score in scores
    }

    # =========================================================
    # ONLY SCORED FINAL ANSWERS
    # =========================================================

    final_scores = []

    for answer in (
        main_question_answers.values()
    ):

        score = score_map.get(
            answer.id
        )

        if score is not None:

            final_scores.append(
                score
            )

    if not final_scores:

        raise ValueError(
            "No final evaluation scores found."
        )

    # =========================================================
    # CALCULATE OVERALL SCORE
    # =========================================================

    overall_score = (
        sum(
            float(
                score.overall_score
            )
            for score
            in final_scores
        )
        / len(final_scores)
    )

    overall_score = round(
        overall_score,
        2,
    )

    # =========================================================
    # MAIN QUESTION COUNT
    # =========================================================

    question_count = len(
        final_scores
    )

    # =========================================================
    # BUILD SUMMARY
    # =========================================================

    if overall_score >= 81:

        performance_description = (
            "The candidate demonstrated strong "
            "overall performance."
        )

    elif overall_score >= 61:

        performance_description = (
            "The candidate demonstrated good "
            "overall performance."
        )

    elif overall_score >= 41:

        performance_description = (
            "The candidate demonstrated moderate "
            "overall performance with areas for improvement."
        )

    else:

        performance_description = (
            "The candidate demonstrated significant "
            "areas for improvement."
        )

    summary = (
        f"The candidate completed the interview with "
        f"an overall score of "
        f"{overall_score:.2f}/100 across "
        f"{question_count} main interview questions. "
        f"{performance_description}"
    )

    # =========================================================
    # FIND EXISTING REPORT
    # =========================================================

    report = (
        db.query(Report)
        .filter(
            Report.session_id == session_id
        )
        .first()
    )

    # =========================================================
    # UPDATE EXISTING REPORT
    # =========================================================

    if report:

        report.overall_score = (
            overall_score
        )

        report.summary = (
            summary
        )

        report.report_url = (
            report.report_url
        )

    # =========================================================
    # CREATE NEW REPORT
    # =========================================================

    else:

        report = Report(
            session_id=session_id,
            overall_score=overall_score,
            summary=summary,
            report_url=None,
        )

        db.add(report)

    # =========================================================
    # FLUSH ONLY
    #
    # IMPORTANT:
    #
    # Do NOT commit here.
    #
    # answer_service.py owns the transaction.
    # =========================================================

    db.flush()

    return report