import os
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from dotenv import load_dotenv
from models import db, User, Donation, Expense, Attendance, Member, MemberAttendance

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-fallback')

db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url or 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

with app.app_context():
    if 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI']:
        if not os.path.exists('instance'):
            try:
                os.makedirs('instance')
            except:
                pass
    db.drop_all() 
    db.create_all()
    if not User.query.filter_by(username='admin').first():
        admin = User(username='admin', password=generate_password_hash('admin123'))
        db.session.add(admin)
        m_y = datetime.now().strftime('%Y-%m')
        today_dt = datetime.now()
        db.session.add(Donation(donor_name="John Doe", amount=5000, date=today_dt, payment_mode="Online", month_year=m_y))
        db.session.add(Donation(donor_name="Jane Smith", amount=2500, date=today_dt, payment_mode="Cash", month_year=m_y))
        db.session.add(Expense(amount=1200, date=today_dt, description="Saturday Prasadi", category="Prasadi", month_year=m_y))
        db.session.add(Expense(amount=300, date=today_dt, description="Cleaning Supplies", category="Other", month_year=m_y))
        db.session.add(Attendance(count=45, date=today_dt, month_year=m_y))
        db.session.commit()

@app.route('/')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('dashboard'))
        flash('Invalid username or password')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# ---- MEMBERS ----

@app.route('/members')
@login_required
def members_page():
    members = Member.query.order_by(Member.name).all()
    # Attach donation totals
    for m in members:
        m.total_donated = sum(d.amount for d in m.donations)
        m.attendance_count = len([a for a in m.attendances if a.status == 'present'])
    return render_template('members.html', members=members, today=datetime.now().strftime('%Y-%m-%d'))

@app.route('/members/add', methods=['POST'])
@login_required
def add_member():
    name = request.form.get('name')
    phone = request.form.get('phone')
    email = request.form.get('email')
    address = request.form.get('address')
    join_date_str = request.form.get('join_date')
    join_date = datetime.strptime(join_date_str, '%Y-%m-%d') if join_date_str else datetime.now()
    member = Member(name=name, phone=phone, email=email, address=address, join_date=join_date)
    db.session.add(member)
    db.session.commit()
    flash('Member added successfully!')
    return redirect(url_for('members_page'))

@app.route('/members/edit/<int:id>', methods=['POST'])
@login_required
def edit_member(id):
    member = Member.query.get_or_404(id)
    member.name = request.form.get('name')
    member.phone = request.form.get('phone')
    member.email = request.form.get('email')
    member.address = request.form.get('address')
    join_date_str = request.form.get('join_date')
    if join_date_str:
        member.join_date = datetime.strptime(join_date_str, '%Y-%m-%d')
    member.is_active = request.form.get('is_active') == 'on'
    db.session.commit()
    flash('Member updated successfully!')
    return redirect(url_for('members_page'))

@app.route('/members/delete/<int:id>', methods=['POST'])
@login_required
def delete_member(id):
    member = Member.query.get_or_404(id)
    db.session.delete(member)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/members')
@login_required
def get_members():
    members = Member.query.filter_by(is_active=True).order_by(Member.name).all()
    return jsonify([{'id': m.id, 'name': m.name} for m in members])

# ---- MEMBER ATTENDANCE ----

@app.route('/attendance/members')
@login_required
def member_attendance_page():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    members = Member.query.filter_by(is_active=True).order_by(Member.name).all()
    # Get all unique dates for this month
    records = MemberAttendance.query.filter_by(month_year=month).all()
    dates = sorted(set(r.date for r in records))
    # Build attendance map: {member_id: {date: status}}
    att_map = {}
    for r in records:
        att_map.setdefault(r.member_id, {})[r.date] = r.status
    return render_template('member_attendance.html', members=members, dates=dates,
                           att_map=att_map, current_month=month,
                           today=datetime.now().strftime('%Y-%m-%d'))

@app.route('/attendance/members/mark', methods=['POST'])
@login_required
def mark_member_attendance():
    date_str = request.form.get('date')
    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    month_year = date_obj.strftime('%Y-%m')
    member_ids = request.form.getlist('member_ids')
    present_ids = set(request.form.getlist('present'))

    # Delete existing records for this date
    MemberAttendance.query.filter_by(date=date_obj).delete()

    for mid in member_ids:
        status = 'present' if mid in present_ids else 'absent'
        db.session.add(MemberAttendance(
            member_id=int(mid),
            date=date_obj,
            month_year=month_year,
            status=status
        ))
    db.session.commit()
    flash('Attendance saved!')
    return redirect(url_for('member_attendance_page', month=month_year))

# ---- STATS ----

@app.route('/api/stats')
@login_required
def get_stats():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    donations = Donation.query.filter_by(month_year=month).all()
    total_income = sum(d.amount for d in donations)
    total_donors = len(donations)
    expenses = Expense.query.filter_by(month_year=month).all()
    prasadi_expenses = sum(e.amount for e in expenses if e.category == 'Prasadi')
    other_expenses = sum(e.amount for e in expenses if e.category != 'Prasadi')
    total_expenses = prasadi_expenses + other_expenses
    attendance_records = Attendance.query.filter_by(month_year=month).all()
    total_attendance = sum(a.count for a in attendance_records)
    avg_attendance = total_attendance / len(attendance_records) if attendance_records else 0
    prasadi_count = len([e for e in expenses if e.category == 'Prasadi'])
    avg_prasadi = prasadi_expenses / prasadi_count if prasadi_count else 0
    return jsonify({
        'totalIncome': total_income,
        'totalExpenses': total_expenses,
        'netBalance': total_income - total_expenses,
        'totalDonors': total_donors,
        'avgAttendance': round(avg_attendance, 1),
        'prasadiExpenses': prasadi_expenses,
        'avgPrasadi': round(avg_prasadi, 2)
    })

@app.route('/donations', methods=['GET', 'POST'])
@login_required
def donations_page():
    if request.method == 'POST':
        name = request.form.get('donor_name')
        amount = float(request.form.get('amount'))
        date_str = request.form.get('date')
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        mode = request.form.get('payment_mode')
        member_id = request.form.get('member_id') or None
        new_donation = Donation(
            donor_name=name, amount=amount, date=date_obj,
            payment_mode=mode, month_year=date_obj.strftime('%Y-%m'),
            member_id=int(member_id) if member_id else None
        )
        db.session.add(new_donation)
        db.session.commit()
        return redirect(url_for('donations_page'))
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    records = Donation.query.filter_by(month_year=month).order_by(Donation.date.desc()).all()
    members = Member.query.filter_by(is_active=True).order_by(Member.name).all()
    return render_template('donations.html', records=records, current_month=month,
                           today=datetime.now().strftime('%Y-%m-%d'), members=members)

@app.route('/expenses', methods=['GET', 'POST'])
@login_required
def expenses_page():
    if request.method == 'POST':
        amount = float(request.form.get('amount'))
        date_str = request.form.get('date')
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        desc = request.form.get('description')
        category = request.form.get('category', 'Prasadi')
        new_expense = Expense(amount=amount, date=date_obj, description=desc,
                              category=category, month_year=date_obj.strftime('%Y-%m'))
        db.session.add(new_expense)
        db.session.commit()
        return redirect(url_for('expenses_page'))
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    records = Expense.query.filter_by(month_year=month).order_by(Expense.date.desc()).all()
    return render_template('expenses.html', records=records, current_month=month,
                           today=datetime.now().strftime('%Y-%m-%d'))

@app.route('/attendance', methods=['GET', 'POST'])
@login_required
def attendance_page():
    if request.method == 'POST':
        count = int(request.form.get('count'))
        date_str = request.form.get('date')
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        new_attendance = Attendance(count=count, date=date_obj, month_year=date_obj.strftime('%Y-%m'))
        db.session.add(new_attendance)
        db.session.commit()
        return redirect(url_for('attendance_page'))
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    records = Attendance.query.filter_by(month_year=month).order_by(Attendance.date.desc()).all()
    return render_template('attendance.html', records=records, current_month=month,
                           today=datetime.now().strftime('%Y-%m-%d'))

@app.route('/api/delete/<type>/<int:id>', methods=['POST'])
@login_required
def delete_record(type, id):
    if type == 'donation':
        item = Donation.query.get_or_404(id)
    elif type == 'expense':
        item = Expense.query.get_or_404(id)
    elif type == 'attendance':
        item = Attendance.query.get_or_404(id)
    elif type == 'member':
        item = Member.query.get_or_404(id)
    else:
        return jsonify({'success': False, 'error': 'Invalid type'})
    db.session.delete(item)
    db.session.commit()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)

@app.route('/api/report')
@login_required
def get_report_data():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    
    # Donations
    donations = Donation.query.filter_by(month_year=month).order_by(Donation.date).all()
    
    # Expenses
    expenses = Expense.query.filter_by(month_year=month).order_by(Expense.date).all()
    
    # Attendance (overall)
    attendance = Attendance.query.filter_by(month_year=month).order_by(Attendance.date).all()
    
    # Members
    members = Member.query.order_by(Member.name).all()
    
    # Member attendance for this month
    member_att = MemberAttendance.query.filter_by(month_year=month).all()
    att_map = {}
    for a in member_att:
        att_map.setdefault(a.member_id, {'present': 0, 'absent': 0})
        att_map[a.member_id][a.status] += 1

    return jsonify({
        'month': month,
        'donations': [{'date': d.date.strftime('%d-%m-%Y'), 'donor_name': d.donor_name,
                       'member': d.member.name if d.member else 'Walk-in',
                       'amount': d.amount, 'payment_mode': d.payment_mode} for d in donations],
        'expenses': [{'date': e.date.strftime('%d-%m-%Y'), 'description': e.description,
                      'category': e.category, 'amount': e.amount} for e in expenses],
        'attendance': [{'date': a.date.strftime('%d-%m-%Y'), 'count': a.count} for a in attendance],
        'members': [{'name': m.name, 'phone': m.phone or '', 'email': m.email or '',
                     'address': m.address or '',
                     'join_date': m.join_date.strftime('%d-%m-%Y'),
                     'status': 'Active' if m.is_active else 'Inactive',
                     'total_donated': sum(d.amount for d in m.donations),
                     'present': att_map.get(m.id, {}).get('present', 0),
                     'absent': att_map.get(m.id, {}).get('absent', 0)} for m in members],
    })
