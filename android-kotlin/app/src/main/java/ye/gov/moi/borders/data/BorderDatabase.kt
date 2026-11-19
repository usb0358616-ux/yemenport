package ye.gov.moi.borders.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "travelers")
data class TravelerEntity(
    @PrimaryKey val id: String,
    val serialNumber: String = "",
    val fullName: String,
    val passportNumber: String,
    val nationality: String = "اليمن",
    val issueDate: String = "",
    val expiryDate: String = "", // YYYY-MM-DD
    val portName: String = "المركز الرئيسي - العاصمة صنعاء",
    val agency: String = "",
    val agencyId: String = "",
    val visaType: String = "",
    val receiveDate: String = "",
    val exitDate: String = "",
    val status: String = "معتمد", // مؤشر | مرتجع | معتمد
    val returnReason: String = "",
    val travelAllowed: String = "نعم", // نعم | لا
    val vettingResult: String = "سليم",
    val synced: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "travel_agencies")
data class TravelAgencyEntity(
    @PrimaryKey val id: String,
    val agencyName: String,
    val governorate: String = "صنعاء",
    val center: String = "",
    val clearanceStatus: String = "معتمد وساري",
    val linkedVisasCount: Int = 0,
    val issuedCount: Int = 0,
    val returnedCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "mofa_visas")
data class MofaVisaEntity(
    @PrimaryKey val id: String,
    val memoNumber: String,
    val memoDate: String,
    val organization: String,
    val requestType: String, // طلب تأشيرة دخول | مانيفست رحلة طيران | إرسالية نقل جوازات
    val flightRoute: String = "",
    val beneficiariesCount: Int = 1,
    val approvalStatus: String = "معتمد رسمياً",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "passport_seizures")
data class PassportSeizureEntity(
    @PrimaryKey val id: String,
    val recordNumber: String,
    val travelerName: String,
    val passportNumber: String,
    val nationality: String = "اليمن",
    val seizurePort: String,
    val seizureDate: String,
    val reason: String,
    val status: String = "جديد", // جديد | تم الفحص | محال | تم التسليم
    val recipientName: String = "",
    val deliveredAt: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "foreigner_residents")
data class ForeignerResidentEntity(
    @PrimaryKey val id: String,
    val residenceNumber: String,
    val fullName: String,
    val passportNumber: String,
    val nationality: String,
    val employer: String,
    val profession: String,
    val entryDate: String,
    val residenceExpiryDate: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "movement_permits")
data class MovementPermitEntity(
    @PrimaryKey val id: String,
    val permitCode: String,
    val delegationName: String,
    val authorizedRoute: String,
    val accommodationPlace: String,
    val passengersCount: Int = 1,
    val validFrom: String,
    val validTo: String,
    val approvalStatus: String = "معتمد رسمياً",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "citizenship_cases")
data class CitizenshipCaseEntity(
    @PrimaryKey val id: String,
    val caseNumber: String,
    val serviceType: String, // طلب جنسية | زواج يمني من أجنبية | جوازات أبناء اليمنيات
    val applicantName: String,
    val spouseOrBeneficiaryName: String = "",
    val spouseNationality: String = "",
    val submissionDate: String,
    val status: String = "قيد المراجعة",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "correspondence_letters")
data class CorrespondenceEntity(
    @PrimaryKey val id: String,
    val referenceNumber: String,
    val direction: String, // صادر | وارد
    val letterType: String,
    val subject: String,
    val summary: String,
    val senderEntity: String,
    val recipientEntity: String,
    val gregorianDate: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "learned_patterns")
data class LearnedPatternEntity(
    @PrimaryKey val id: String,
    val patternType: String, // instruction | column_signature
    val instructionText: String,
    val keywordsCsv: String,
    val targetCategory: String,
    val frequency: Int = 1,
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "watchlist_reports")
data class WatchlistReportEntity(
    @PrimaryKey val id: String,
    val title: String,
    val targetName: String,
    val targetPassportNumber: String,
    val description: String,
    val status: String = "جديد",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "port_officers")
data class PortOfficerEntity(
    @PrimaryKey val id: String,
    val rank: String,
    val fullName: String,
    val assignedPort: String,
    val role: String = "ضابط منفذ",
    val isDutyOfficer: Boolean = false
)

@Dao
interface BorderDao {
    @Query("SELECT * FROM travelers ORDER BY createdAt DESC LIMIT 500")
    fun observeTravelers(): Flow<List<TravelerEntity>>

    @Query("SELECT * FROM travelers ORDER BY createdAt DESC")
    suspend fun getAllTravelers(): List<TravelerEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTraveler(traveler: TravelerEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTravelersBatch(travelers: List<TravelerEntity>)

    @Query("SELECT * FROM travelers WHERE synced = 0")
    suspend fun getPendingSyncTravelers(): List<TravelerEntity>

    @Query("UPDATE travelers SET synced = 1 WHERE id IN (:ids)")
    suspend fun markTravelersSynced(ids: List<String>)

    @Query("SELECT * FROM travel_agencies ORDER BY linkedVisasCount DESC, agencyName ASC")
    fun observeAgencies(): Flow<List<TravelAgencyEntity>>

    @Query("SELECT * FROM travel_agencies")
    suspend fun getAllAgencies(): List<TravelAgencyEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAgencies(agencies: List<TravelAgencyEntity>)

    @Query("SELECT * FROM mofa_visas ORDER BY createdAt DESC")
    fun observeMofaVisas(): Flow<List<MofaVisaEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMofaVisa(item: MofaVisaEntity)

    @Query("SELECT * FROM passport_seizures ORDER BY createdAt DESC")
    fun observeSeizures(): Flow<List<PassportSeizureEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSeizure(item: PassportSeizureEntity)

    @Query("SELECT * FROM foreigner_residents ORDER BY createdAt DESC")
    fun observeForeigners(): Flow<List<ForeignerResidentEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertForeignersBatch(items: List<ForeignerResidentEntity>)

    @Query("SELECT * FROM movement_permits ORDER BY createdAt DESC")
    fun observePermits(): Flow<List<MovementPermitEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPermit(item: MovementPermitEntity)

    @Query("SELECT * FROM citizenship_cases ORDER BY createdAt DESC")
    fun observeCitizenshipCases(): Flow<List<CitizenshipCaseEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCitizenshipCase(item: CitizenshipCaseEntity)

    @Query("SELECT * FROM correspondence_letters ORDER BY createdAt DESC")
    fun observeCorrespondence(): Flow<List<CorrespondenceEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCorrespondence(item: CorrespondenceEntity)

    @Query("SELECT * FROM learned_patterns ORDER BY frequency DESC, updatedAt DESC")
    fun observeLearnedPatterns(): Flow<List<LearnedPatternEntity>>

    @Query("SELECT * FROM learned_patterns")
    suspend fun getAllLearnedPatterns(): List<LearnedPatternEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertLearnedPattern(pattern: LearnedPatternEntity)

    @Query("DELETE FROM learned_patterns WHERE id = :id")
    suspend fun deleteLearnedPattern(id: String)

    @Query("SELECT * FROM watchlist_reports ORDER BY createdAt DESC")
    fun observeWatchlist(): Flow<List<WatchlistReportEntity>>

    @Query("SELECT * FROM watchlist_reports")
    suspend fun getAllWatchlist(): List<WatchlistReportEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReport(report: WatchlistReportEntity)

    @Query(
        """
        SELECT * FROM watchlist_reports
        WHERE (targetPassportNumber != '' AND targetPassportNumber = :passportNo)
           OR (targetName != '' AND targetName LIKE '%' || :name || '%')
        LIMIT 1
    """
    )
    suspend fun findWatchlistMatch(passportNo: String, name: String): WatchlistReportEntity?

    @Query("SELECT * FROM port_officers ORDER BY isDutyOfficer DESC, fullName ASC")
    fun observeOfficers(): Flow<List<PortOfficerEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOfficer(officer: PortOfficerEntity)
}

@Database(
    entities = [
        TravelerEntity::class,
        TravelAgencyEntity::class,
        MofaVisaEntity::class,
        PassportSeizureEntity::class,
        ForeignerResidentEntity::class,
        MovementPermitEntity::class,
        CitizenshipCaseEntity::class,
        CorrespondenceEntity::class,
        LearnedPatternEntity::class,
        WatchlistReportEntity::class,
        PortOfficerEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class BorderDatabase : RoomDatabase() {
    abstract fun borderDao(): BorderDao

    companion object {
        @Volatile
        private var INSTANCE: BorderDatabase? = null

        fun getInstance(context: Context): BorderDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    BorderDatabase::class.java,
                    "yemen_borders_sovereign.db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }

        val YEMEN_PORTS = listOf(
            "المركز الرئيسي - العاصمة صنعاء",
            "مطار صنعاء الدولي",
            "مطار عدن الدولي",
            "مطار الريان الدولي",
            "مطار سيئون الدولي",
            "مطار الغيضة الدولي",
            "مطار سقطرى الدولي",
            "مطار الحديدة الدولي",
            "منفذ الوديعة البري",
            "منفذ شحن البري",
            "منفذ صرفيت البري",
            "منفذ علب البري",
            "منفذ الطوال البري",
            "ميناء عدن البحري",
            "ميناء الحديدة البحري",
            "ميناء المكلا البحري",
            "ميناء نشطون البحري",
            "ميناء الصليف البحري",
            "ميناء المخا البحري"
        )
    }
}
