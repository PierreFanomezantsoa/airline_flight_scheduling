import pandas as pd
from flask import Blueprint, jsonify
from models import db, Flight

analytics_bp = Blueprint('analytics', __name__)

@analytics_bp.route('/flights/analytics', methods=['GET'])
def get_analytics():
    try:
        query = db.session.query(Flight.statut).all()
        if not query:
            return jsonify({
                "metrics": {
                    "totalFlights": 0, "otpRate": 100, "onTimeCount": 0,
                    "delayedCount": 0, "cancelledCount": 0, "inFlightCount": 0, "completedCount": 0
                }
            }), 200

        df = pd.DataFrame(query, columns=['statut'])
        total = len(df)

        scheduled = len(df[df['statut'] == 'Scheduled'])
        delayed = len(df[df['statut'] == 'Delayed'])
        in_flight = len(df[df['statut'] == 'In-Flight'])
        cancelled = len(df[df['statut'] == 'Cancelled'])
        completed = len(df[df['statut'] == 'Effectué'])

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