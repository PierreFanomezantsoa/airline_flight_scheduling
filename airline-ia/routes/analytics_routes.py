import pandas as pd
from flask import Blueprint, jsonify
from models import db, Flight

analytics_bp = Blueprint('analytics', __name__)

@analytics_bp.route('/flights/analytics', methods=['GET'])
def get_analytics():
    try:
        query = db.session.query(Flight.status).all()
        if not query:
            return jsonify({
                "metrics": {
                    "totalFlights": 0, "otpRate": 100, "onTimeCount": 0,
                    "delayedCount": 0, "cancelledCount": 0, "inFlightCount": 0, "completedCount": 0
                }
            }), 200

        df = pd.DataFrame(query, columns=['status'])
        total = len(df)

        scheduled = len(df[df['status'] == 'Scheduled'])
        delayed = len(df[df['status'] == 'Delayed'])
        in_flight = len(df[df['status'] == 'In-Flight'])
        cancelled = len(df[df['status'] == 'Cancelled'])
        completed = len(df[df['status'] == 'Effectué'])

        otp_rate = round((scheduled / total) * 100) if total > 0 else 100

        return jsonify({
            "metrics": {
                "totalFlights": total,
                "otpRate": otp_rate,
                "onTimeCount": scheduled,
                "delayedCount": delayed,
                "inFlightCount": in_flight,
                "cancelledCount": cancelled,
                "completedCount": completed
            }
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500